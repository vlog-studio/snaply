"""레퍼런스 말뭉치 — 사람이 모은 인기 숏브이로그를 특징값으로 바꾸고(원본은 지운다) 레시피 커버리지 · 군집 리포트를 낸다.

    cd apps/ai-worker
    .venv/bin/python scripts/reference-corpus.py init <dir>
    .venv/bin/python scripts/reference-corpus.py collect <dir> --source <목록 · 영상 URL> [--sources-file f] [--per-source N]
        [--max-duration S] [--min-views V] [--since-days D] [--cookies-from-browser chrome] [--dry-run]
    .venv/bin/python scripts/reference-corpus.py analyze <dir> [--speech] [--keep-originals]
    .venv/bin/python scripts/reference-corpus.py report <dir> [--k N]

오프라인 R&D 전용이다 — 운영(워커 · API)은 이 결과를 쓰지 않는다. <dir> 은 이 저장소(또는 다른 git 작업 트리) **밖**이어야 한다 —
남의 영상이 커밋되면 안 된다. init 이 videos/ · features/ · 헤더만 있는 sheet.csv 를 만들면, 영상을 videos/<id>.* 로 넣고 시트에
한 줄씩 적는다(칸: pipeline/reference_rows.py). analyze 는 영상마다 CFR 30fps · 앞뒤 잘라내기 · 위아래 UI 잘라내기로 임시 파일을 만들어
재고(reference.measure — analyze-reference.py 와 같은 흐름) features/<id>.json 을 남긴 뒤 원본을 지운다. report 는 report.json · report.md.
"""

import argparse
import csv
import json
import subprocess
import sys
import tempfile
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from loguru import logger

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from pipeline import hdr, recipe, reference, reference_collect as collector, reference_corpus as corpus  # noqa: E402
from pipeline.reference_corpus_md import to_markdown  # noqa: E402

FPS = 30
MIN_LENGTH_S = 1.0  # 잘라내고 남은 길이가 이보다 짧으면 실패로


class CorpusError(RuntimeError):
    """말뭉치 디렉터리를 쓸 수 없다 — 메시지가 사람에게 보인다."""


# ── 디렉터리 ──────────────────────────────────────────────────────────
def git_root_of(path: Path) -> Path | None:
    """path(아직 없어도 된다)를 품은 git 작업 트리의 뿌리 — 위로 올라가며 .git(디렉터리 · 워크트리 파일)을 찾는다."""
    target = path.expanduser().resolve()
    return next((p for p in (target, *target.parents) if (p / ".git").exists()), None)


def ensure_outside_repo(path: Path) -> Path:
    root = git_root_of(path)
    if root is not None:
        raise CorpusError(f"{path} 는 git 저장소({root}) 안이다 — 원본 영상이 커밋되지 않게 저장소 밖 디렉터리를 쓴다")
    return path.expanduser().resolve()


def init(path: Path) -> Path:
    """videos/ · features/ · 헤더만 있는 sheet.csv. 이미 있는 시트는 건드리지 않는다."""
    root = ensure_outside_repo(path)
    for sub in ("videos", "features"):
        (root / sub).mkdir(parents=True, exist_ok=True)
    sheet = root / "sheet.csv"
    if not sheet.exists():
        with sheet.open("w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(corpus.SHEET_COLUMNS)
    logger.info("말뭉치 준비: {} (영상은 videos/<id>.*, 한 줄씩 sheet.csv)", root)
    return root


def read_sheet(root: Path) -> list[dict[str, str | None]]:
    sheet = root / "sheet.csv"
    if not sheet.is_file():
        raise CorpusError(f"{sheet} 가 없다 — init 을 먼저")
    with sheet.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def video_of(root: Path, video_id: str) -> Path | None:
    found = sorted(p for p in (root / "videos").glob(f"{video_id}.*") if p.is_file() and not p.name.startswith("."))
    return found[0] if found else None


# ── 정규화 · 분석 ─────────────────────────────────────────────────────
def duration_s(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(json.loads(out)["format"]["duration"])


def video_filter(row: corpus.Row, src: Path) -> str:
    """HDR 이면 톤매핑, 위아래 UI 잘라내기(짝수 높이), CFR 30fps."""
    top, bottom = row.crop_top or 0.0, row.crop_bottom or 0.0
    crop = [f"crop=iw:trunc(ih*{1 - top - bottom:.4f}/2)*2:0:trunc(ih*{top:.4f}/2)*2"] if top or bottom else []
    return ",".join([*hdr.source_filters(str(src)), *crop, f"fps={FPS}"])


def normalize(src: Path, dst: Path, row: corpus.Row) -> None:
    """화면 녹화의 가변 프레임 · 엔딩 카드 · 앱 UI 를 걷어 낸 임시 파일(dst)."""
    start = row.trim_start_s or 0.0
    length = duration_s(src) - start - (row.trim_end_s or 0.0)
    if length < MIN_LENGTH_S:
        raise ValueError(f"잘라내고 남은 길이가 {length:.2f}초 — trim_start_s · trim_end_s 를 확인")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", str(src),
                    "-map", "0:v:0", "-map", "0:a:0?", "-vf", video_filter(row, src), "-fps_mode", "cfr",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", str(dst)],
                   capture_output=True, check=True)


def feature_doc(row: corpus.Row, measured: reference.Measured) -> dict:
    return {"id": row.id, "platform": row.platform, "source": f"{row.platform}_ref",
            "featureVersion": corpus.CORPUS_FEATURE_VERSION, "recipeVocabularyVersion": recipe.RECIPE_VOCABULARY_VERSION,
            "analyzedAt": datetime.now(UTC).isoformat(timespec="seconds"), "capture": row.capture,
            "reading": asdict(measured.reading), "letterbox": measured.letterbox,
            "boundaries": measured.boundaries or []}


def _plain(value: object) -> object:
    if isinstance(value, np.generic):
        return value.item()
    raise TypeError(f"JSON 으로 못 바꾼다: {type(value).__name__}")


def write_json(path: Path, doc: dict) -> None:
    """임시 이름에 쓰고 바꿔 단다 — 중간에 멈춰도 반쯤 쓴 특징 파일이 '이미 분석함'으로 보이지 않게."""
    partial = path.with_suffix(".json.partial")
    partial.write_text(json.dumps(doc, ensure_ascii=False, indent=1, default=_plain), encoding="utf-8")
    partial.replace(path)


def analyze_one(root: Path, row: corpus.Row, src: Path, speech: bool) -> None:
    with tempfile.TemporaryDirectory(prefix="reference-corpus-") as tmp:
        work = Path(tmp) / "normalized.mp4"
        normalize(src, work, row)
        measured = reference.measure(str(work), speech=speech, with_boundaries=True)
    write_json(root / "features" / f"{row.id}.json", feature_doc(row, measured))


def _pending(root: Path, raw: dict[str, str | None]) -> tuple[corpus.Row, Path] | str:
    """처리할 행이면 (행, 원본), 아니면 건너뛰는 이유."""
    row = corpus.parse_row(raw)
    if isinstance(row, str):
        return f"시트 행이 잘못됨 — {row}"
    if (root / "features" / f"{row.id}.json").exists():
        return f"{row.id}: 이미 분석함"
    src = video_of(root, row.id)
    return (row, src) if src else f"{row.id}: videos/{row.id}.* 가 없음"


def _run(root: Path, raw: dict[str, str | None], speech: bool, keep_originals: bool) -> str:
    """행 하나 — "ok" · "failed" · "skipped". 성공하면 원본을 지운다(keep_originals 면 둔다)."""
    todo = _pending(root, raw)
    if isinstance(todo, str):
        logger.info("건너뜀: {}", todo)
        return "skipped"
    row, src = todo
    try:
        analyze_one(root, row, src, speech)
    except Exception:  # noqa: BLE001 — 영상 하나의 실패(ffmpeg · whisper · 깨진 파일)가 말뭉치 전체를 멈추지 않게
        logger.exception("실패: {} ({})", row.id, src.name)
        return "failed"
    logger.info("분석함: {}{}", row.id, "" if keep_originals else " — 원본 삭제")
    if not keep_originals:
        src.unlink()
    return "ok"


def analyze(path: Path, speech: bool = False, keep_originals: bool = False) -> dict[str, int]:
    """시트 행마다 분석 — 파일 하나 실패는 남기고 계속, 끝에 성공 · 실패 · 건너뜀 수."""
    root = ensure_outside_repo(path)
    counts = {"ok": 0, "failed": 0, "skipped": 0}
    for raw in read_sheet(root):
        counts[_run(root, raw, speech, keep_originals)] += 1
    logger.info("끝 — 성공 {ok} · 실패 {failed} · 건너뜀 {skipped}", **counts)
    return counts


# ── 수집 ──────────────────────────────────────────────────────────────
def append_rows(root: Path, rows: list[dict[str, str]]) -> None:
    with (root / "sheet.csv").open("a", newline="", encoding="utf-8") as f:
        csv.DictWriter(f, fieldnames=corpus.SHEET_COLUMNS, restval="").writerows(rows)


def _collect_one(root: Path, url: str, opts: argparse.Namespace, seen: set[str]) -> str:
    """한 영상 — 고르면 받고 시트에 한 줄 더한다. 결과: 'ok' · 'skipped'."""
    platform = collector.platform_of(url)
    info = collector.probe(url, opts.cookies_from_browser)
    file_id = collector.row_id(platform, str(info["id"]))
    reason = "이미 있음" if file_id in seen else collector.skip_reason(info, opts.rules, datetime.now(UTC).date())
    if reason:
        logger.info("건너뜀 {}: {}", file_id, reason)
        return "skipped"
    if not opts.dry_run:
        collector.download(info, root / "videos", file_id, opts.cookies_from_browser)
        append_rows(root, [collector.sheet_row(info, platform)])
    seen.add(file_id)
    logger.info("{} {} — 조회수 {}", "고름" if opts.dry_run else "받음", file_id, info.get("view_count"))
    return "ok"


def _sources(opts: argparse.Namespace) -> list[str]:
    listed = opts.sources_file.read_text(encoding="utf-8").splitlines() if opts.sources_file else []
    return [s.strip() for s in [*opts.source, *listed] if s.strip() and not s.lstrip().startswith("#")]


def collect(opts: argparse.Namespace) -> dict[str, int]:
    """목록마다 영상 URL 을 훑어 규칙에 맞는 것만 받는다 — 영상 하나 실패는 남기고 계속."""
    root = ensure_outside_repo(opts.dir)
    seen = {(r.get("id") or "").strip() for r in read_sheet(root)}
    counts = {"ok": 0, "failed": 0, "skipped": 0}
    for source in _sources(opts):
        if collector.platform_of(source) is None:
            raise CorpusError(f"모르는 플랫폼: {source}")
        try:
            urls = list(collector.entries(source, opts.per_source, opts.cookies_from_browser))
        except Exception:  # noqa: BLE001 — 목록 하나(막힌 피드 · 비공개 계정)로 수집 전체를 멈추지 않는다
            logger.exception("목록 실패: {}", source)
            continue
        for url in urls:
            try:
                counts[_collect_one(root, url, opts, seen)] += 1
            except Exception:  # noqa: BLE001 — 영상 하나(비공개 · 삭제 · 차단)로 수집 전체를 멈추지 않는다
                logger.exception("실패: {}", url)
                counts["failed"] += 1
    logger.info("수집 끝 — 고름 {ok} · 실패 {failed} · 건너뜀 {skipped}", **counts)
    return counts


# ── 리포트 ────────────────────────────────────────────────────────────
def load_features(root: Path) -> list[dict]:
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted((root / "features").glob("*.json"))]


def write_report(path: Path, k: int | None = None) -> dict:
    root = ensure_outside_repo(path)
    rows = [r for r in map(corpus.parse_row, read_sheet(root)) if not isinstance(r, str)]
    docs = load_features(root)
    if not docs:
        raise CorpusError(f"{root / 'features'} 에 특징 파일이 없다 — analyze 를 먼저")
    out = {**corpus.report(docs, rows, recipe.RECIPES, k), "recipeVocabularyVersion": recipe.RECIPE_VOCABULARY_VERSION,
           "generatedAt": datetime.now(UTC).isoformat(timespec="seconds")}
    if out["featureVersions"] != [corpus.CORPUS_FEATURE_VERSION]:
        logger.warning("특징 판이 섞였다 {} — 지금 판은 {}", out["featureVersions"], corpus.CORPUS_FEATURE_VERSION)
    write_json(root / "report.json", out)
    (root / "report.md").write_text(to_markdown(out), encoding="utf-8")
    logger.info("리포트: {} — 커버리지 {:.0%}, 군집 {}", root / "report.md", out["coverage"]["ratio"], out["clustering"]["k"])
    return out


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init").add_argument("dir", type=Path)
    col = sub.add_parser("collect")
    col.add_argument("dir", type=Path)
    col.add_argument("--source", action="append", default=[], help="해시태그 피드 · 계정 · 영상 URL(여러 번)")
    col.add_argument("--sources-file", type=Path, help="한 줄에 URL 하나(# 은 주석)")
    col.add_argument("--per-source", type=int, default=30, help="목록마다 훑을 영상 수")
    col.add_argument("--max-duration", type=float, default=90.0)
    col.add_argument("--min-views", type=int, default=10_000)
    col.add_argument("--since-days", type=int, default=60, help="0 이면 업로드일을 보지 않는다")
    col.add_argument("--cookies-from-browser", help="로그인이 필요한 플랫폼(인스타그램) — 예: chrome")
    col.add_argument("--dry-run", action="store_true", help="받지 않고 고를 것만 보인다")
    run = sub.add_parser("analyze")
    run.add_argument("dir", type=Path)
    run.add_argument("--speech", action="store_true", help="whisper 로 원본 말소리를 본다(느리다)")
    run.add_argument("--keep-originals", action="store_true", help="분석한 원본을 지우지 않는다")
    rep = sub.add_parser("report")
    rep.add_argument("dir", type=Path)
    rep.add_argument("--k", type=int, default=None, help="군집 수(없으면 silhouette 로 고른다)")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        if args.command == "init":
            init(args.dir)
        elif args.command == "collect":
            args.rules = collector.Rules(args.max_duration, args.min_views, args.since_days or None)
            collect(args)
        elif args.command == "analyze":
            analyze(args.dir, args.speech, args.keep_originals)
        else:
            write_report(args.dir, args.k)
    except CorpusError as exc:
        logger.error("{}", exc)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
