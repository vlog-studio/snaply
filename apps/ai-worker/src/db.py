"""asyncpg 기반 edit_jobs / videos 상태 업데이트."""

import json
from datetime import datetime, timezone

import asyncpg
from loguru import logger

from config import DATABASE_URL

_pool: asyncpg.Pool | None = None


async def init_pool() -> None:
    global _pool
    if _pool is None:
        # Supabase session pooler(DIRECT_URL) 사용. statement_cache_size=0 은
        # 풀러 환경에서 prepared statement 충돌을 피하기 위함.
        _pool = await asyncpg.create_pool(
            DATABASE_URL, min_size=1, max_size=4, statement_cache_size=0
        )
        logger.info("asyncpg 풀 생성 완료")


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def _pool_or_raise() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB 풀이 초기화되지 않았습니다. init_pool()을 먼저 호출하세요.")
    return _pool


def pool() -> asyncpg.Pool:
    """다른 워커 모듈(analysis_db)이 같은 풀을 쓰기 위한 접근자."""
    return _pool_or_raise()


async def fetch_job_context(job_id: str) -> dict | None:
    """edit_jobs에서 결과물 video_id, user_id 조회."""
    async with _pool_or_raise().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT user_id, video_id FROM edit_jobs WHERE id=$1", job_id
        )
        if not row:
            return None
        return {"user_id": str(row["user_id"]), "video_id": str(row["video_id"])}


async def fetch_source_keys(user_id: str, video_ids: list[str]) -> dict[str, str]:
    """Return owned, ready source keys keyed by video id."""
    async with _pool_or_raise().acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, s3_key FROM videos "
            "WHERE id = ANY($1::uuid[]) AND user_id=$2 AND kind='source' "
            "AND status='ready' AND deleted_at IS NULL",
            video_ids,
            user_id,
        )
    return {str(row["id"]): row["s3_key"] for row in rows if row["s3_key"]}


async def fetch_accent_inputs(video_ids: list[str]) -> tuple[dict[str, dict], dict[str, list[float]]]:
    """텍스트 액센트의 입력 — (스냅마다 최신 완료 분석의 목록 필드, 스냅마다 움직임 곡선).

    분석은 동의한 스냅에만 있다(동의를 거두면 지워진다 — ANA-3). 없는 스냅은 빠진다 — 액센트는 그 컷을 장소 키워드나 쉼으로 둔다.
    """
    async with _pool_or_raise().acquire() as conn:
        analyses = await conn.fetch(
            "SELECT DISTINCT ON (video_id) video_id, summary, topics, places, objects, actions, moods, "
            "       frame_timestamps_ms, subjects "
            "FROM video_analyses WHERE video_id = ANY($1::uuid[]) AND status='done' "
            "ORDER BY video_id, analysis_version DESC",
            video_ids,
        )
        signals = await conn.fetch(
            "SELECT video_id, motion FROM video_signals WHERE video_id = ANY($1::uuid[])", video_ids
        )
    by_video = {
        str(row["video_id"]): {
            **{k: (list(row[k]) if k != "summary" else row[k]) for k in
               ("summary", "topics", "places", "objects", "actions", "moods")},
            # 프레임별 피사체 상자(decisions/subject-boxes.md) — 글 · 이모지를 피사체 옆에. JSONB 는 문자열로 온다
            "frameTimestampsMs": list(row["frame_timestamps_ms"] or []),
            "subjects": _json_list(row["subjects"]),
        }
        for row in analyses
    }
    return by_video, {str(row["video_id"]): list(row["motion"] or []) for row in signals}


def _json_list(value) -> list:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return []
    return value if isinstance(value, list) else []


async def fetch_captured_at(video_ids: list[str]) -> dict:
    """스냅마다 촬영 시각(없으면 빠진다) — 하루 타임스탬프 포맷의 글. 저장된 그대로(UTC)라 표시할 때 시간대를 맞춘다."""
    async with _pool_or_raise().acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, captured_at FROM videos WHERE id = ANY($1::uuid[]) AND captured_at IS NOT NULL", video_ids
        )
    return {str(row["id"]): row["captured_at"] for row in rows}


async def fetch_lined_up_with(video_ids: list[str]) -> tuple[dict[str, str | None], dict[str, str | None]]:
    """스냅마다 앱 id(client_id)와 겹쳐 보며 이어 찍은 앞 컷의 앱 id — 짝은 편집기가 무비 안에서 찾는다(SNAP-24)."""
    async with _pool_or_raise().acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, client_id, lined_up_with_client_id FROM videos WHERE id = ANY($1::uuid[])", video_ids
        )
    return ({str(row["id"]): row["client_id"] for row in rows},
            {str(row["id"]): row["lined_up_with_client_id"] for row in rows})


async def set_video_result(
    video_id: str,
    edited_url: str,
    edited_s3_key: str,
    thumbnail_url: str,
    thumbnail_s3_key: str,
) -> None:
    async with _pool_or_raise().acquire() as conn:
        await conn.execute(
            "UPDATE videos SET edited_url=$2, edited_s3_key=$3, "
            "thumbnail_url=$4, thumbnail_s3_key=$5, status='done' WHERE id=$1",
            video_id,
            edited_url,
            edited_s3_key,
            thumbnail_url,
            thumbnail_s3_key,
        )


async def mark_processing(job_id: str) -> bool:
    """queued/processing일 때만 processing으로 전이. False면 취소(또는 종료)된 작업."""
    now = datetime.now(timezone.utc)
    async with _pool_or_raise().acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE edit_jobs SET status='processing', started_at=$2, progress=0 "
            "WHERE id=$1 AND status IN ('queued','processing') RETURNING id",
            job_id,
            now,
        )
        return row is not None


async def fetch_job_status(job_id: str) -> str | None:
    """작업의 지금 상태. 시작이 거절된 이유(취소인지, 이미 끝났는지)를 가를 때 쓴다."""
    async with _pool_or_raise().acquire() as conn:
        return await conn.fetchval("SELECT status FROM edit_jobs WHERE id=$1", job_id)


async def requeue_for_retry(job_id: str) -> bool:
    """일시적 실패 뒤 큐의 다음 시도를 기다리도록 queued 로 되돌린다(진행률 0).

    processing 일 때만 바꾼다. False 면 그 사이 취소된 작업 — 다시 시도하지 않는다.
    상태가 queued 라 앱의 따라잡기는 "아직 만드는 중"으로 읽고, 실패도 환급도 일어나지 않는다.
    """
    async with _pool_or_raise().acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE edit_jobs SET status='queued', progress=0 "
            "WHERE id=$1 AND status='processing' RETURNING id",
            job_id,
        )
        return row is not None


async def update_progress(job_id: str, progress: int) -> bool:
    """processing일 때만 갱신. False면 그 사이 취소된 작업 — 파이프라인을 중단해야 한다."""
    async with _pool_or_raise().acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE edit_jobs SET progress=$2 WHERE id=$1 AND status='processing' RETURNING id",
            job_id,
            progress,
        )
        return row is not None


async def mark_done(job_id: str) -> bool:
    """processing일 때만 done으로 확정. False면 취소된 작업이 done으로 되살아나는 것을 막은 것."""
    now = datetime.now(timezone.utc)
    async with _pool_or_raise().acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE edit_jobs SET status='done', progress=100, completed_at=$2 "
            "WHERE id=$1 AND status='processing' RETURNING video_id",
            job_id,
            now,
        )
        if row and row["video_id"]:
            await conn.execute(
                "UPDATE videos SET status='done' WHERE id=$1 AND deleted_at IS NULL",
                row["video_id"],
            )
        return row is not None


async def mark_failed(job_id: str, error_message: str, error_code: str = "INTERNAL") -> None:
    """진행 중 작업만 failed 처리. 이미 canceled/done이면 덮어쓰지 않는다.

    실패를 확정한 경우에만 예약 크레딧을 환급한다 — 실패의 최종 판정 주체가 워커이므로
    여기서 즉시 돌려주는 것이 사용자에게 정확하다.
    """
    now = datetime.now(timezone.utc)
    async with _pool_or_raise().acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE edit_jobs SET status='failed', error_message=$2, error_code=$3, "
            "completed_at=$4 "
            "WHERE id=$1 AND status IN ('queued','processing') RETURNING video_id",
            job_id,
            error_message[:1000],
            error_code,
            now,
        )
        if row is None:
            return  # 이미 canceled/done — 상태도 크레딧도 건드리지 않는다
        if row["video_id"]:
            await conn.execute(
                "UPDATE videos SET status='failed' WHERE id=$1 AND deleted_at IS NULL",
                row["video_id"],
            )
        await _refund_export_credits(conn, job_id)


async def _refund_export_credits(conn, job_id: str) -> None:
    """실패한 export 의 예약 크레딧을 환급한다.

    환급 로직 자체는 DB 함수 `refund_export_credits` 에 있다(마이그레이션
    `20260814010000_add_refund_export_credits_function`). 환급을 실행하는 주체가 API 취소
    경로와 이 워커 둘이라, 같은 SQL 을 두 언어에 복사하면 한쪽만 고쳐질 수 있다. 정의는
    DB 한 곳에 두고 여기서는 호출만 한다 — **SQL 을 여기로 다시 옮기지 말 것.**

    멱등하다: `credit_ledger(edit_job_id, reason)` unique 제약이 중복 환급을 막는다.
    """
    await conn.execute("SELECT refund_export_credits($1::uuid)", job_id)
