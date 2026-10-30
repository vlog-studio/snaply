"""BullMQ 'edit-jobs' 큐 구독 워커 — 실제 AI 편집 파이프라인 (Phase 5).

큐에서 job을 받아 원본 다운로드 → 컷편집 → BGM → 자막 → 썸네일 → S3 업로드를
수행하고, edit_jobs/videos 상태를 갱신하며 진행률을 Redis Pub/Sub으로 발행한다.
"""

import asyncio
import hashlib
import json
import os
import shutil
import signal
import tempfile
from dataclasses import replace

import redis.asyncio as aioredis
from bullmq import Worker
from loguru import logger

import config
import db
import notify
import storage
from pipeline import (accent_stage, anchor, editor, invalidation, match_cut, music, orient, recipe, seed, subtitle,
                      transition, trend_edit, vocabulary)
from pipeline.edit_spec import parse_job_clips, parse_timeline
from pipeline.editor import get_preset
from pipeline.render_spec import LETTERBOX, RenderSpec, parse_render_spec
from queue_connection import worker_connection

_publisher: aioredis.Redis | None = None


class JobCanceled(Exception):
    """API가 작업을 canceled로 바꿔 파이프라인을 중단해야 할 때."""


class JobSettled(Exception):
    """이미 끝난(failed·done) 작업을 큐가 다시 넘겼을 때. 취소가 아니므로 따로 기록한다."""


#: 일시적 실패 뒤 다시 시도할 때 진행 채널에 싣는 단계. 앱이 "다시 시도하는 중"으로 읽는다
#: (apps/mobile 의 edit-step-label.ts). 진행률은 0 이지만 앱은 진행률을 되돌리지 않는다.
RETRY_STEP = "다시 시도"


class SourceUnavailableError(RuntimeError):
    """원본 클립을 찾을 수 없음 — 실패 분류 코드 SOURCE_UNAVAILABLE."""


def _init_sentry() -> None:
    """SENTRY_DSN이 있을 때만 초기화. 없으면 no-op."""
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        return
    import sentry_sdk

    sentry_sdk.init(dsn=dsn, environment=os.environ.get("NODE_ENV", "development"))
    logger.info("Sentry 초기화 완료")


def _capture(exc: BaseException) -> None:
    if not os.environ.get("SENTRY_DSN"):
        return
    import sentry_sdk

    sentry_sdk.capture_exception(exc)


def _finalize_or_keep(current: str, final_path: str) -> str:
    """마지막 손질을 하고 그 결과를 돌려준다. 실패하면 손질 전 파일을 그대로 쓴다(backlog E-51).

    손질은 음량과 첫 재생 시간뿐이라, 없어도 무비는 재생된다 — 비싼 단계를 다 거친 뒤 작업 전체를 실패시켜 처음부터
    다시 돌리는 것보다 낫다. 자막이 실패하면 자막 없이 가는 것과 같다.
    """
    try:
        editor.finalize(current, final_path)
    except RuntimeError as exc:  # editor._run 이 ffmpeg 실패를 이것으로 올린다
        logger.warning("마지막 손질 실패 — 손질 없이 올린다: {}", str(exc)[-300:])
        _capture(exc)
        return current
    return final_path


async def _publish(job_id: str, payload: dict) -> None:
    if _publisher is not None:
        await _publisher.publish(config.edit_progress_channel(job_id), json.dumps(payload))


async def _progress(job_id: str, progress: int, step: str, extra: dict | None = None) -> None:
    # 갱신 실패 = 그 사이 취소됨(status가 processing이 아님) → 파이프라인 중단
    if not await db.update_progress(job_id, progress):
        raise JobCanceled(job_id)
    await _publish(job_id, {"progress": progress, "step": step, **(extra or {})})


async def _run_pipeline(job_id: str, data: dict, work_dir: str) -> None:
    user_id = data["userId"]
    edit_spec = data.get("editSpec") or {"stylePreset": data.get("stylePreset", "일상")}
    # v3 는 경계마다 전환을 갖는다(specs/movie.md MOV-22). edit-v3 큐로만 오므로 구버전 워커는
    # 이 작업을 받지 않는다 — 받았다면 전환을 버리고 v2 로 "성공"했을 것이다(edit-spec-v3.md §4).
    timeline = parse_timeline(edit_spec) if edit_spec.get("version") == 3 else None
    clip_specs = timeline.cuts if timeline is not None else parse_job_clips(data)
    preset = get_preset(edit_spec["stylePreset"])
    render_spec = parse_render_spec(data.get("renderSpec"))
    recipe_name = _recipe_of(edit_spec)
    render_spec = _framed(render_spec, recipe_name)
    # 무비의 꾸밈(글자 · 이모지 · 얼굴 스티커) — 붙일지는 이 값만 정한다(text-accent-stickers.md §9). 없으면 레시피 기본값.
    decorations = recipe.decorations_of(recipe_name, edit_spec.get("decorations"))

    ctx = await db.fetch_job_context(job_id)
    if ctx is None:
        raise RuntimeError("edit_jobs 레코드를 찾을 수 없습니다.")
    output_video_id = ctx["video_id"]

    if not await db.mark_processing(job_id):
        # 다시 시도로 온 작업이 그 사이 취소됐거나, 이미 실패·완료로 끝난 작업이다.
        if await db.fetch_job_status(job_id) == "canceled":
            raise JobCanceled(job_id)
        raise JobSettled(job_id)
    await _publish(job_id, {"progress": 0, "step": "시작"})

    # 1) 원본 클립 다운로드
    video_ids = list(dict.fromkeys(clip.video_id for clip in clip_specs))
    source_keys = await db.fetch_source_keys(user_id, video_ids)
    if len(source_keys) != len(video_ids):
        raise SourceUnavailableError("원본 클립을 찾을 수 없습니다.")
    local_sources: dict[str, str] = {}
    for i, video_id in enumerate(video_ids):
        key = source_keys[video_id]
        local = os.path.join(work_dir, f"src_{i}{os.path.splitext(key)[1] or '.mp4'}")
        await asyncio.to_thread(storage.download, key, local)
        local_sources[video_id] = local
    local_sources = await _upright_sources(local_sources, work_dir)
    clips = [
        editor.ClipSource(local_sources[clip.video_id], clip.start_ms, clip.end_ms)
        for clip in clip_specs
    ]
    await _progress(job_id, 10, "원본 다운로드 완료")

    # 2') 레시피가 컷까지 고르는 무비(MOV-28) — 컷 구간 · 순서를 전부 AI 가 정했을 때만(autoCuts). 레시피가 스냅에서 컷을
    #     다시 고르고(매치컷 · 점수 위주 순서) 효과 · 음원 · 글 · 효과음까지 한 번에 굽는다. 실패하면 아래 보통 경로로 간다.
    if timeline is not None and recipe_name != recipe.CLASSIC and edit_spec.get("autoCuts"):
        trend = await _render_trend(video_ids, local_sources, preset, recipe_name, data, job_id, user_id, work_dir,
                                    _variant_key(data.get("movieId") or job_id, edit_spec), decorations)
        if trend is not None:
            await _finish(job_id, user_id, output_video_id, trend, work_dir)
            return

    # 2) 컷편집
    if timeline is not None:
        base = await asyncio.to_thread(
            editor.edit_timeline, clips, timeline.transitions, preset, render_spec, work_dir
        )
    else:
        base = await asyncio.to_thread(editor.edit, clips, preset, render_spec, work_dir)
    duration = await asyncio.to_thread(editor.probe_duration, base)
    await _progress(job_id, 35, "컷편집 완료")

    # 3) BGM 매칭/합성 — 곡은 무비 단위로 고정된다(E-5). 무비를 모르는 예전 작업은 작업 id 로 고른다.
    with_bgm_path = os.path.join(work_dir, "with_bgm.mp4")
    current, _bgm_ok = await asyncio.to_thread(
        music.apply_bgm, base, preset.bgm_tag, with_bgm_path, duration, data.get("movieId") or job_id,
        *_audio_gains(recipe_name),
    )
    await _progress(job_id, 60, "음악 매칭 중...")

    # 3-1) 꾸밈(글자 · 이모지 · 얼굴 스티커)과 레시피의 고정 타이틀 · 효과음 — 컷이 timeline 에 있는 v3 무비만(MOV-27 · MOV-28).
    #      붙일지는 무비의 꾸밈 설정만 정한다(text-accent-stickers.md §9). 실패하면 없이 간다.
    if timeline is not None and (recipe_name != recipe.CLASSIC or any(decorations.values())):
        current = await _apply_accents(current, clips, clip_specs, preset, _bgm_ok, duration, data, job_id, work_dir,
                                       recipe_name, render_spec.fit_mode, decorations)

    # 4) 자막 생성/삽입 — 요청 시에만 (쇼츠용이 기본이라 디폴트는 건너뜀 → whisper 추론 비용 절약)
    if data.get("subtitles", False):
        with_sub_path = os.path.join(work_dir, "with_sub.mp4")
        current, _sub_ok = await asyncio.to_thread(
            subtitle.apply_subtitles, current, work_dir, with_sub_path
        )
        await _progress(job_id, 85, "자막 생성 중...")
    else:
        await _progress(job_id, 85, "자막 건너뜀")

    # 마지막 손질 — 전체 음량을 플랫폼 기준으로, 첫 재생을 앞당긴다(editor.finalize).
    current = await asyncio.to_thread(_finalize_or_keep, current, os.path.join(work_dir, "final.mp4"))

    await _finish(job_id, user_id, output_video_id, current, work_dir)


async def _finish(job_id: str, user_id: str, output_video_id: str, current: str, work_dir: str) -> None:
    """썸네일 · 업로드 · 결과 반영 · 완료 알림 — 보통 경로와 레시피 경로가 같이 쓴다."""
    duration = await asyncio.to_thread(editor.probe_duration, current)
    # 5) 썸네일 추출 (기본 1초, 짧은 결과물은 중간 시점)
    thumb_path = os.path.join(work_dir, "thumb.jpg")
    thumbnail_at = min(1.0, duration / 2)
    await asyncio.to_thread(editor.extract_thumbnail, current, thumb_path, thumbnail_at)

    # 6) S3 업로드
    edited_key = storage.edited_key(user_id, job_id)
    thumb_key = storage.thumbnail_key(user_id, job_id)
    edited_url = await asyncio.to_thread(storage.upload, current, edited_key, "video/mp4")
    thumbnail_url = await asyncio.to_thread(storage.upload, thumb_path, thumb_key, "image/jpeg")
    await _progress(job_id, 95, "업로드 중...")

    # 7) 결과 반영
    await db.set_video_result(
        output_video_id,
        edited_url,
        edited_key,
        thumbnail_url,
        thumb_key,
    )
    if not await db.mark_done(job_id):
        # 업로드까지 끝났지만 그 사이 취소됨 — done으로 되살리지 않는다 (산출물은 GC가 정리)
        raise JobCanceled(job_id)
    output_url = storage.download_url(edited_key)
    await _publish(job_id, {"progress": 100, "step": "완료", "outputUrl": output_url})
    # 앱이 꺼져 있어도 알 수 있게 푸시를 요청한다. WS 는 화면이 열려 있을 때만 닿는다.
    await notify.movie_ready(user_id, output_video_id)
    logger.info("편집 완료 job_id={} url={}", job_id, edited_url)


def _variant_key(movie_key: str, edit_spec: dict) -> str:
    """레시피 편집의 시드 — 무비 + 구성(편집 스펙). 같은 구성으로 다시 만들면 같은 편집이고(MOV-14), 컷 · 레시피 · 스타일이 바뀌면 새로 고른다.
    작업 id 를 넣던 때는 다시 만들 때마다 순서 · 효과가 바뀌어 MOV-14 와 어긋났다(backlog E-65, 2026-10-27).
    꾸밈(`decorations`)은 빼고 해시한다 — 글자만 꺼도 컷 · 순서 · 효과가 다시 섞이지 않게(text-accent-stickers.md §9)."""
    edit = {k: v for k, v in edit_spec.items() if k != "decorations"}
    digest = hashlib.sha256(json.dumps(edit, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]
    return f"{movie_key}:{digest}"


async def _render_trend(video_ids, local_sources, preset, recipe_name, data, job_id, user_id, work_dir,
                        variant_key: str | None = None, decorations: dict[str, bool] | None = None) -> str | None:
    """레시피로 스냅에서 컷을 다시 골라 한 편을 굽는다(trend_edit.render). 실패하면 None — 보통 경로로 간다.
    variant_key 는 순서 · 효과의 시드(`_variant_key`) — 없으면 무비 키."""
    movie_key = data.get("movieId") or job_id
    try:
        analyses, _motions = await db.fetch_accent_inputs(video_ids)
        captured = await db.fetch_captured_at(video_ids)
        client_ids, lined = await db.fetch_lined_up_with(video_ids)
        pairs = match_cut.pairs_of(video_ids, [client_ids.get(v) for v in video_ids], [lined.get(v) for v in video_ids])
        snaps = [trend_edit.Snap(local_sources[v], analyses.get(v) or {}, _local_time(captured.get(v)),
                                 local_sources[video_ids[pairs[k]]] if pairs[k] is not None else None)
                 for k, v in enumerate(video_ids)]
        # 곡 라이브러리는 컨테이너 안에 받아 둔다(볼륨 없음) — 배포로 새로 뜬 워커는 비어 있으므로 고르기 전에 맞춘다. 보통 경로는
        # music.apply_bgm 이 맞추지만 이 경로는 곡을 직접 고른다(빠뜨려 배포 직후 AI 컷 무비에 BGM 이 없었다, 2026-10-29)
        await asyncio.to_thread(music.sync_library)
        track = music.pick_track(preset.bgm_tag, movie_key)
        await _progress(job_id, 20, "레시피 편집 중...")
        out = os.path.join(work_dir, "trend.mp4")
        # 곡은 무비마다 같고(movie_key), 순서 · 효과의 시드는 무비 + 구성이다 — 같은 구성이면 같은 편집(MOV-14)
        result = await asyncio.to_thread(trend_edit.render, snaps, recipe_name, track, variant_key or movie_key, work_dir, out,
                                         decorations=decorations)
        logger.info(
            "레시피 편집 job_id={} recipe={} duration={} cuts={} links={} accents={} sfx={} edl={}",
            job_id, recipe_name, result.duration_s, len(result.cuts), [l.get("score") for l in result.links],
            result.accents, len(result.sfx), json.dumps(result.edl, ensure_ascii=False, default=str)[:4000],
        )
        await _progress(job_id, 85, "레시피 편집 완료")
        return out
    except JobCanceled:
        raise
    except Exception as exc:  # noqa: BLE001 — 레시피 경로가 실패해도 무비는 보통 경로로 만든다
        logger.warning("레시피 편집 실패 — 보통 경로로 job_id={} recipe={}: {}", job_id, recipe_name, exc)
        _capture(exc)
        return None


async def _upright_sources(local_sources: dict[str, str], work_dir: str) -> dict[str, str]:
    """회전 정보가 잘못 붙은 원본(메신저를 거친 영상 — 세우면 오히려 눕는다)을 바로잡는다(pipeline/orient.py). 실패하면 원본 그대로."""
    out = {}
    for video_id, path in local_sources.items():
        try:
            fixed = await asyncio.to_thread(orient.fix, path, work_dir)
        except Exception as exc:  # noqa: BLE001 — 바로잡지 못해도 편집은 계속한다
            logger.warning("회전 확인 실패 — 원본 그대로 video_id={}: {}", video_id, exc)
            fixed = path
        if fixed != path:
            logger.info("회전 정보 바로잡음 video_id={}", video_id)
        out[video_id] = fixed
    return out


def _local_time(at):
    """저장된 촬영 시각(UTC) → 화면에 쓸 시각. 사용자 시간대를 아직 모르므로 서비스 기준 시간대(KST)로(backlog A-20)."""
    if at is None:
        return None
    from datetime import timedelta, timezone  # noqa: PLC0415
    aware = at if at.tzinfo else at.replace(tzinfo=timezone.utc)
    return aware.astimezone(timezone(timedelta(hours=9))).replace(tzinfo=None)


def _framed(render_spec: RenderSpec, recipe_name: str) -> RenderSpec:
    """레터박스 레시피(시네마틱 등)는 보통 경로(컷을 손본 무비 · 레시피 렌더 실패)에서도 AI 컷 경로와 같은 띠로 — 원본을 가운데 16:9 띠에
    꽉 채우고 위아래를 검게 둔다. 무비의 맞춤 방식(블러 · 단색)은 쓰지 않는다(specs/movie.md MOV-8 · MOV-28, 2026-10-30 사용자).
    처음엔 남는 자리만 검게(pad_black) 채워 세로 원본에는 띠가 생기지 않았다."""
    if recipe.get(recipe_name).spec.get("frame") == "letterbox":
        return replace(render_spec, fit_mode=LETTERBOX)
    return render_spec


def _recipe_of(edit_spec: dict) -> str:
    """무비의 레시피 — 스펙에 없으면 classic(API 는 classic 무비에 recipe 를 싣지 않는다). 모르는 이름이면 classic 으로(작업을 실패시키지 않는다).
    워커 전체의 기본 레시피는 두지 않는다 — 사용자가 고른 '기본'을 덮게 된다(backlog E-67)."""
    name = edit_spec.get("recipe") or recipe.CLASSIC
    try:
        return recipe.get(name).name
    except recipe.RecipeError:
        logger.warning("모르는 레시피 {} — classic 으로", name)
        return recipe.CLASSIC


async def _apply_accents(current, clips, clip_specs, preset, bgm_ok, duration, data, job_id, work_dir,
                         recipe_name: str, fit_mode: str, decorations: dict[str, bool] | None = None) -> str:
    movie_key = data.get("movieId") or job_id
    windows = await asyncio.to_thread(editor.cut_windows, clips)
    cuts = [
        accent_stage.CutSource(spec.video_id, clip.path, start, end, source)
        for spec, clip, (start, end, source) in zip(clip_specs, clips, windows)
    ]
    analyses, motions = await db.fetch_accent_inputs(list(dict.fromkeys(c.video_id for c in cuts)))
    # BGM 을 입혔으면 그 곡(무비마다 같은 곡 — music.pick_track)의 비트에 맞춘다
    track = music.pick_track(preset.bgm_tag, movie_key) if bgm_ok else None
    result, outcome = await asyncio.to_thread(
        accent_stage.apply, current, cuts, analyses, motions, track, int(duration * 1000), movie_key,
        work_dir, os.path.join(work_dir, "with_accents.mp4"), recipe_name, fit_mode, decorations,
    )
    logger.info(
        "꾸밈 job_id={} decorations={} applied={} accents={} stickers={} faces={} bpm={} reason={}",
        job_id, decorations, outcome.applied, outcome.accents, outcome.stickers, outcome.faces, outcome.bpm, outcome.reason,
    )
    return result


def _audio_gains(recipe_name: str) -> tuple[float, float]:
    """레시피의 (원본 소리, BGM) 크기. 음원만 모드여도 BGM 이 없으면 music.apply_bgm 이 원본을 그대로 둔다 — 무음 무비를 만들지 않는다."""
    audio = recipe.get(recipe_name).spec["audio"]
    return audio["sourceGain"], audio["bgmGain"]


def _is_last_attempt(job) -> bool:
    """이번이 큐가 주는 마지막 시도인가. 큐 설정(attempts)은 API 의 edit-queue.ts 가 정한다."""
    attempts = int((job.opts or {}).get("attempts") or 1)
    return job.attemptsMade + 1 >= attempts


async def _fail(job_id: str, message: str, code: str, user_error: str) -> None:
    """실패를 확정한다 — 상태 · 환급(db.mark_failed) · 앱에 알릴 마지막 프레임."""
    await db.mark_failed(job_id, message, code)
    await _publish(job_id, {"status": "failed", "error": user_error, "code": code})


async def process_edit_job(job, _job_token) -> dict:
    job_id = job.data["jobId"]
    edit_spec = job.data.get("editSpec") or {}
    logger.info(
        "편집 작업 수신 job_id={} spec=v{} clips={}",
        job_id,
        edit_spec.get("version"),
        # v3 는 컷을 timeline 에만 둔다.
        job.data.get("clips")
        or job.data.get("videoIds")
        or (edit_spec.get("timeline") or {}).get("cuts"),
    )
    work_dir = tempfile.mkdtemp(prefix=f"edit_{job_id}_")
    try:
        await asyncio.wait_for(
            _run_pipeline(job_id, job.data, work_dir),
            timeout=config.EDIT_TIMEOUT_SECONDS,
        )
        return {"jobId": job_id, "status": "done"}
    except JobCanceled:
        # 취소는 실패가 아니다 — 상태 변경·WS 종료 메시지는 API의 취소 처리가 이미 수행했다.
        # raise하지 않아 BullMQ 재시도도 일어나지 않는다.
        logger.info("편집 취소 감지, 중단 job_id={}", job_id)
        return {"jobId": job_id, "status": "canceled"}
    except JobSettled:
        logger.info("이미 끝난 작업이라 건너뜀 job_id={}", job_id)
        return {"jobId": job_id, "status": "settled"}
    # 다시 해도 같은 결과가 나오는 실패는 바로 확정한다(specs/movie.md MOV-12). `discarded` 는 큐의
    # 남은 시도를 버린다 — 시간 초과를 세 번 기다리게 하지 않는다.
    except asyncio.TimeoutError:
        logger.error("편집 타임아웃 job_id={}", job_id)
        job.discarded = True
        await _fail(job_id, "편집 시간이 초과되었습니다.", "TIMEOUT", "편집 시간이 초과되었습니다.")
        raise
    except SourceUnavailableError as exc:
        logger.error("원본 클립 없음 job_id={}", job_id)
        job.discarded = True
        await _fail(job_id, str(exc), "SOURCE_UNAVAILABLE", str(exc))
        raise
    except Exception as exc:  # noqa: BLE001
        _capture(exc)
        if _is_last_attempt(job):
            logger.exception("편집 실패 job_id={}", job_id)
            await _fail(job_id, str(exc), "INTERNAL", "편집 중 오류가 발생했습니다.")
            raise
        # 일시적일 수 있는 실패(네트워크 · 저장소) — 사용자에게 실패를 알리지 않고 큐의 다음 시도에 맡긴다.
        # 실패 확정과 환급은 마지막 시도에서만 한다(backlog E-27).
        if not await db.requeue_for_retry(job_id):
            logger.info("편집 취소 감지, 중단 job_id={}", job_id)
            return {"jobId": job_id, "status": "canceled"}
        logger.opt(exception=exc).warning(
            "편집 실패, 다시 시도 예정 job_id={} attempt={}/{}",
            job_id,
            job.attemptsMade + 1,
            (job.opts or {}).get("attempts"),
        )
        await _publish(job_id, {"progress": 0, "step": RETRY_STEP})
        raise
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


async def main() -> None:
    global _publisher
    # 사전이 하나라도 없으면 여기서 멈춘다 — DB·Redis 를 건드리기 **전**이다.
    # 소비 모듈을 임포트했는지와 무관하게 도는 것이 요점이다. 임포트에만 기대면 사전을 늘릴
    # 때마다 이 파일도 같이 고쳐야 하고, 실제로 두 번 빠뜨렸다. 넷째가 생겨도 이 줄은 그대로다.
    loaded = vocabulary.verify_all()

    _init_sentry()
    await db.init_pool()
    _publisher = aioredis.from_url(config.REDIS_URL, decode_responses=True)
    # whisper 모델은 자막 요청(subtitles=true)이 처음 올 때 lazy 로드한다.
    # 기본 플로우(자막 없음)에서는 로드하지 않아 기동이 빠르고 메모리를 아낀다.

    # 두 큐를 같은 처리기로 소비한다. edit-v3 에는 v3 스펙만 오고, 기존 큐에는 v1/v2 가 온다.
    # 큐를 나눈 이유는 구버전 워커가 v3 를 받지 않게 하는 것뿐이라 처리 경로는 스펙 버전이 가른다.
    workers = [
        Worker(queue_name, process_edit_job, {"connection": worker_connection(config.REDIS_URL, queue_name)})
        for queue_name in (config.EDIT_QUEUE_NAME, config.EDIT_V3_QUEUE_NAME)
    ]
    # 이미지에 어떤 사전이 들어 있는지는 렌더 결과를 되짚을 때 첫 단서라 기동 로그에 남긴다.
    # 버전 항목은 모듈을 임포트해야 나오므로 사전이 늘면 이 줄도 늘어난다 — 다만 **기동 검증은
    # 위 verify_all() 이 이미 마쳤다.** 로그가 빠뜨려도 없는 사전으로 뜨지는 않는다.
    logger.info(
        "edit-jobs 워커 시작 (queue={},{} 사전={}종 anchor=v{} derivation=v{} stage=v{}"
        " invalidation=v{} transition=v{})",
        config.EDIT_QUEUE_NAME,
        config.EDIT_V3_QUEUE_NAME,
        len(loaded),
        anchor.VOCABULARY_VERSION,
        anchor.DERIVATION_VERSION,
        seed.STAGE_VOCABULARY_VERSION,
        invalidation.INVALIDATION_VOCABULARY_VERSION,
        transition.TRANSITION_VOCABULARY_VERSION,
    )

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop_event.set)

    await stop_event.wait()
    logger.info("종료 신호 수신, 정리 중...")
    for worker in workers:
        await worker.close()
    if _publisher is not None:
        await _publisher.aclose()
    await notify.close()
    await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
