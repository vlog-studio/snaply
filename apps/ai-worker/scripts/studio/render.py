"""로컬 레시피 스튜디오의 렌더 한 번 — 스냅 파일들로 레시피 무비를 굽고 결과를 잰다(워커 컨테이너 안에서 돈다).

    python scripts/studio/render.py --out 폴더 --recipe trend-routine [--style 일상] [--no-analysis] 스냅.mp4 ...

`server.py` 가 `docker run` 으로 부른다. 운영 워커와 같은 모듈을 그대로 쓴다 — 회전 바로잡기(`orient.fix`) → 내용 분석
(`video_analysis.analyzer`, 스냅 파일 해시로 캐시) → 촬영 시각 순(`--locked` 면 넘긴 순서) → 레시피면 `trend_edit.render`,
classic 이거나 순서를 고정했으면 운영 워커의 보통 경로(바로 넘김 편집 + BGM + 꾸밈) → `metrics.measure`.
진행은 `STUDIO {"progress": ..}` 줄로, 결과는 `--out` 의 `result.json` 으로 남긴다. 꾸밈(`--decorations`) · 편집 선택(`--speech` ·
`--scene-order`) · 순서 고정은 앱의 꾸밈 · 세부 시트와 같은 뜻이다(MOV-27 · MOV-29).
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import metrics  # noqa: E402
from pipeline import accent_stage, ai_cuts, editor, music, orient, recipe, snap_signals, text_accent, trend_edit  # noqa: E402
from pipeline import transition as tr  # noqa: E402
from pipeline.render_spec import DEFAULT_RENDER_SPEC  # noqa: E402
from pipeline.video_analysis import analyzer  # noqa: E402

KST = timezone(timedelta(hours=9))


def say(**payload) -> None:
    sys.stdout.write("STUDIO " + json.dumps(payload, ensure_ascii=False, default=str) + "\n")
    sys.stdout.flush()


def captured_at(path: str) -> datetime | None:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format_tags=creation_time", "-of", "csv=p=0", path],
                         capture_output=True, text=True).stdout.strip()
    try:
        return datetime.fromisoformat(out.replace("Z", "+00:00")).astimezone(KST)
    except ValueError:
        return None


def file_key(path: str) -> str:
    digest = hashlib.sha1()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def analysis_of(path: str, cache_dir: Path, enabled: bool) -> dict:
    """분석 결과 — 같은 파일이면 캐시를 쓴다(vision 호출은 비용이 든다). 끄거나 실패하면 빈 분석(규칙만으로 간다)."""
    cache = cache_dir / f"{file_key(path)}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    if not enabled or not os.environ.get("OPENAI_API_KEY"):
        return {}
    work = cache_dir / (cache.stem + "_frames")
    work.mkdir(parents=True, exist_ok=True)
    try:
        result = analyzer.analyze(path, str(work)).result
    except Exception as exc:  # noqa: BLE001 — 분석 없이도 렌더한다
        say(warning=f"분석 실패 {Path(path).name}: {exc}")
        return {}
    cache.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    return result


SING_ACTIONS = ("노래", "마이크", "sing")


def hear_singing(snaps: list[trend_edit.Snap]) -> list[str]:
    """노래방처럼 반주 위의 노래는 VAD(`snap_signals.speech_spans`)가 말소리로 잡지 못한다(2026-10-30, 노래방 스냅 9개 모두 0구간).
    분석의 동작에 노래 · 마이크가 있는 스냅은 통째로 말소리 구간으로 본다 — 스튜디오 전용 실험(`--sing`), 운영 워커는 그대로 VAD 만 쓴다."""
    singing = {s.path: ((0, int(editor.probe_duration(s.path) * 1000)),) for s in snaps
               if any(w in a for a in s.analysis.get("actions") or [] for w in SING_ACTIONS)}
    measured = snap_signals.speech_spans
    snap_signals.speech_spans = lambda path: singing.get(path) or measured(path)
    return [Path(p).name for p in singing]


def black_bars() -> None:
    """가로 영상의 남는 자리를 검게(실험 `--black`) — 보통 경로의 기본(blur_background)과 레시피 경로의 꽉 채움(cover, 잘림) 대신 pad_black."""
    global DEFAULT_RENDER_SPEC
    DEFAULT_RENDER_SPEC = replace(DEFAULT_RENDER_SPEC, fit_mode="pad_black")
    seg_spec = trend_edit._seg_spec
    trend_edit._seg_spec = lambda spec: seg_spec(spec) if spec["frame"] == "letterbox" else DEFAULT_RENDER_SPEC


def new_stickers_only() -> None:
    """이모지 후보를 그림 스티커(sk-*, 2026-10-29 추가)로만(실험 `--new-stickers`) — 예전 Noto 이모지(왕관 등)는 뺀다."""
    stickers = text_accent.VOCABULARY["stickers"]
    for table in stickers["byConcept"].values():
        for concept, listed in table.items():
            table[concept] = [cp for cp in listed if cp.startswith("sk-")]
    stickers["sparkle"] = [cp for cp in stickers["sparkle"] if cp.startswith("sk-")] or ["sk-6196", "sk-6197"]
    stickers["generatedPool"] = [cp for cp in stickers["generatedPool"] if cp.startswith("sk-")]


def timeline(snaps: list[trend_edit.Snap], recipe_name: str, style: str, key: str, work: str, out: str,
             editing: dict[str, bool], decorations: dict[str, bool], ai_trimmed: bool = True) -> dict:
    """운영 워커의 보통 경로(worker.py `_process` 2-1 ~ 3-1)처럼 — 컷을 바로 넘김으로 잇고, 레시피의 음량으로 음원을 깔고, 레시피면 또는
    꾸밈을 켰으면 글 · 이모지 · 얼굴 스티커를 얹는다. 길이 상한이 없다 — 컷 길이의 합이 무비 길이다.
    `ai_trimmed` 면 컷을 AI 가 자른 것으로 보고 흔들림 · 박자에 맞춰 줄인다(ai_cuts, MOV-29 — 앱의 자동 편집 초안).
    아니면 앱의 '스냅 골라 새 무비'처럼 스냅 전체가 사용자 컷이다(autoCuts 아님 — 그대로 잇는다)."""
    preset = editor.get_preset(style)
    render_spec = DEFAULT_RENDER_SPEC
    if recipe.get(recipe_name).spec.get("frame") == "letterbox":  # worker._framed
        render_spec = replace(render_spec, fit_mode="pad_black")
    track = music.pick_track(preset.bgm_tag, key)
    clips = [editor.ClipSource(s.path, 0, int(editor.probe_duration(s.path) * 1000)) for s in snaps]
    transitions = [tr.Transition(tr.HARDCUT)] * (len(clips) - 1)
    refined = ai_cuts.apply(clips, [ai_trimmed] * len(clips), transitions, editing, track, render_spec.fps)
    clips = refined.clips
    base = editor.edit_timeline(clips, refined.transitions, preset, render_spec, work)
    duration = editor.probe_duration(base)
    gains = recipe.get(recipe_name).spec["audio"]
    current, bgm_ok = music.apply_bgm(base, preset.bgm_tag, os.path.join(work, "bgm.mp4"), duration, key,
                                      gains["sourceGain"], gains["bgmGain"],
                                      speech=[(a / 1000, b / 1000) for a, b in refined.talking] or None)
    accents: dict = {}
    if recipe_name != recipe.CLASSIC or any(decorations.values()):
        say(progress=70, step="꾸밈")
        ids = [str(i) for i in refined.order]
        cuts = [accent_stage.CutSource(vid, clip.path, start, end, source)
                for vid, clip, (start, end, source) in zip(ids, clips, editor.cut_windows(clips))]
        analyses = {str(i): s.analysis for i, s in enumerate(snaps) if s.analysis}
        motions = {str(i): list(snap_signals.read_signals(s.path).motion) for i, s in enumerate(snaps)}
        current, outcome = accent_stage.apply(current, cuts, analyses, motions, track if bgm_ok else None, int(duration * 1000), key,
                                              work, os.path.join(work, "with_accents.mp4"), recipe_name, render_spec.fit_mode, decorations)
        accents = {"applied": outcome.applied, "accents": outcome.accents, "stickers": outcome.stickers, "faces": outcome.faces,
                   "reason": outcome.reason}
    editor.finalize(current, out)
    at, clips_out = 0.0, []
    for k, clip in enumerate(clips):
        d = (clip.end_ms - clip.start_ms) / 1000
        clips_out.append({"snap": refined.order[k], "in": round(clip.start_ms / 1000, 3), "out": round(clip.end_ms / 1000, 3),
                          "at": round(at, 3), "transition": "hardcut"})
        at += d
    return {"track": track, "edl": {"clips": clips_out, "speech": refined.talking}, "decorated": accents, "order": refined.order}


def trend(snaps: list[trend_edit.Snap], name: str, tag: str, key: str, work: str, out: str, stabilize: bool = False,
          editing: dict[str, bool] | None = None, decorations: dict[str, bool] | None = None) -> dict:
    track = music.pick_track(tag, key)
    r = trend_edit.render(snaps, name, track, key, work, out, decorations=decorations, stabilize=stabilize, editing=editing)
    return {"track": track, "bpm": r.bpm, "edl": r.edl, "transitions": r.transitions, "splits": r.splits, "look": r.look,
            "faces": r.faces, "accents": r.accents, "stickers": r.stickers, "sfx": r.sfx, "title": r.title, "order": r.order,
            "dropped": r.dropped, "stabilized": r.stabilized}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--recipe", default=recipe.CLASSIC)
    ap.add_argument("--style", default="일상", choices=["일상", "여행", "감성"])
    ap.add_argument("--key", default="studio")
    ap.add_argument("--cache", default="/out/.cache/analysis")
    ap.add_argument("--no-analysis", action="store_true")
    ap.add_argument("--stabilize", action="store_true", help="흔들리는 컷의 손떨림 보정(실험 — 운영 워커는 켜지 않는다)")
    ap.add_argument("--speech", action="store_true", help="편집 선택: 말하는 구간의 말소리 살리기(MOV-29)")
    ap.add_argument("--scene-order", action="store_true", help="편집 선택: 장면 단위 순서 · 첫 컷 훅(MOV-29)")
    ap.add_argument("--decorations", default="", help='꾸밈 JSON — {"text": true, "emoji": false, "face": true}, 빠진 키는 레시피 기본값')
    ap.add_argument("--locked", action="store_true", help="세부 '순서 고정': 넘긴 순서 그대로 잇는다(레시피가 컷 · 순서를 고르지 않는다)")
    ap.add_argument("--auto", action="store_true",
                    help="만드는 방법 '자동 편집': AI 가 자른 컷(순서 고정을 끈 레시피면 레시피가 컷 · 길이를 고른다). 없으면 '새 무비' — 스냅 전체를 잇는다")
    ap.add_argument("--black", action="store_true", help="가로 영상의 남는 자리를 검게(블러 · 잘림 대신)")
    ap.add_argument("--new-stickers", action="store_true", help="이모지는 그림 스티커(sk-*)만")
    ap.add_argument("--sing", action="store_true", help="노래 살리기(실험): 분석상 노래하는 스냅을 통째로 말소리로 — 말소리 선택을 켠다")
    ap.add_argument("snaps", nargs="+")
    args = ap.parse_args()
    if args.black:
        black_bars()
    if args.new_stickers:
        new_stickers_only()
    out_dir, cache_dir = Path(args.out), Path(args.cache)
    work = out_dir / "work"
    work.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()

    say(progress=5, step="회전 확인")
    upright = [orient.fix(p, str(work)) for p in args.snaps]
    snaps = []
    for k, (src, path) in enumerate(zip(args.snaps, upright)):
        say(progress=5 + 30 * k // len(upright), step=f"내용 분석 {k + 1}/{len(upright)}")
        snaps.append(trend_edit.Snap(path, analysis_of(src, cache_dir, not args.no_analysis), captured_at(src)))
    # 순서 고정이면 고른 순서 그대로, 아니면 앱의 AI 순서처럼 촬영 시각 순(앱 세부 시트 '지금 순서' / '찍은 시각 순')
    order = list(range(len(snaps))) if args.locked else \
        sorted(range(len(snaps)), key=lambda i: snaps[i].captured_at or datetime.min.replace(tzinfo=KST))
    snaps = [snaps[i] for i in order]
    names = [Path(args.snaps[i]).name for i in order]

    say(progress=40, step="렌더")
    movie = str(out_dir / "movie.mp4")
    tag = editor.get_preset(args.style).bgm_tag
    # 장면 순서는 순서의 주인이 AI 인 무비만(API movie.service 의 export 와 같다)
    editing = {"speech": args.speech or args.sing, "sceneOrder": args.scene_order and not args.locked}
    singing = hear_singing(snaps) if args.sing else []
    decorations = recipe.decorations_of(args.recipe, json.loads(args.decorations) if args.decorations else None)
    # 운영 워커와 같은 갈림 — 레시피가 컷까지 고르는 건 자동 편집(AI 가 자르고 순서도 AI)인 레시피 무비뿐(autoCuts, MOV-28)
    if not args.auto or args.recipe == recipe.CLASSIC or args.locked:
        result = timeline(snaps, args.recipe, args.style, args.key, str(work), movie, editing, decorations, ai_trimmed=args.auto)
    else:
        result = trend(snaps, args.recipe, tag, args.key, str(work), movie, args.stabilize, editing, decorations)

    say(progress=90, step="측정")
    result.update(recipe=args.recipe, style=args.style, snaps=names, stabilize=args.stabilize, editing=editing,
                  decorations=decorations, locked=args.locked, auto=args.auto, singing=singing, seconds=round(time.monotonic() - started, 1),
                  analyses={n: s.analysis.get("summary") for n, s in zip(names, snaps)},
                  metrics=metrics.measure(movie, result.get("edl") or {}, result.get("track")))
    (out_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    say(progress=100, step="완료", movie="movie.mp4")


if __name__ == "__main__":
    main()
