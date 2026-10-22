"""스타일 프리셋 태그 기반 BGM 매칭 및 합성 (v1).

**곡은 무비 단위로 고정된다**(backlog E-5). 태그 디렉터리의 곡을 이름순으로 놓고 `sha256("{key}:music:{tag}")` 로
하나를 고른다 — 키는 무비 id 라서 컷을 넣고 빼고 순서를 바꿔 다시 만들어도 같은 곡이다(무효화 사전: 컷 변경은
`music` 을 유지). 스타일을 바꾸면 태그가 바뀌어 다른 곡이 된다. 라이브러리의 곡이 늘거나 줄면 고르는 결과가 바뀔
수 있다 — 트랙 id 를 스펙에 핀으로 남기는 것은 `bgm_tracks`(A-7)와 함께 한다.

**곡은 git 에 없다**(라이선스 · 용량). `BGM_S3_PREFIX` 가 있으면 버킷의 `{prefix}manifest.json` 이 적은 곡을
`BGM_DIR` 로 받아 와 맞춘다(`sync_library`). 목록 권한 없이 객체 읽기만으로 된다. 매니페스트는 곡마다 출처 ·
약관 · 확인일을 함께 적는 자리다(docs/decisions/bgm-sourcing.md "공모전 기간").
"""

import hashlib
import json
import subprocess
import tempfile
import threading
import time
from pathlib import Path

from loguru import logger

import config

AUDIO_EXTS = {".m4a", ".mp3", ".aac", ".wav", ".ogg", ".flac"}
MANIFEST_NAME = "manifest.json"
# 버킷을 다시 볼 간격. 곡을 올리면 이 시간 안에 워커가 받아 온다(재시작 없이).
SYNC_INTERVAL_SECONDS = 600

_sync_lock = threading.Lock()
_last_sync = 0.0


def _bgm_root() -> Path:
    root = Path(config.BGM_DIR)
    if not root.is_absolute():
        root = config.WORKER_ROOT / root
    return root


def _audio_files(directory: Path, recursive: bool = False) -> list[Path]:
    if not directory.is_dir():
        return []
    found = directory.rglob("*") if recursive else directory.glob("*")
    return sorted(p for p in found if p.is_file() and p.suffix.lower() in AUDIO_EXTS)


def pick_track(tag: str, key: str) -> str | None:
    """태그 디렉터리에서 `key` 로 정해지는 곡. 태그에 곡이 없으면 전체에서, 그래도 없으면 None."""
    root = _bgm_root()
    candidates = _audio_files(root / tag) or _audio_files(root, recursive=True)
    if not candidates:
        logger.warning("BGM 없음 (tag={}, dir={}) — BGM 없이 진행", tag, root)
        return None
    digest = hashlib.sha256(f"{key}:music:{tag}".encode()).digest()
    index = int.from_bytes(digest[:8], "big") % len(candidates)
    return str(candidates[index])


class ManifestError(ValueError):
    """매니페스트가 약속한 모양이 아니다 — 조용히 일부만 받지 않는다."""


def parse_manifest(raw: bytes) -> list[tuple[str, str]]:
    """매니페스트의 곡 목록 → `(tag, file)` 목록.

    ```json
    {"tracks": [{"tag": "calm", "file": "a.mp3", "title": "…", "source": "…", "licenseUrl": "…", "checkedAt": "2026-10-15"}]}
    ```

    `tag` 는 프리셋 태그 디렉터리 이름, `file` 은 그 아래의 파일 이름(경로 없이)이다. 나머지는 사람이 읽는 기록이다.
    """
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ManifestError(f"매니페스트가 JSON 이 아니다: {exc}") from exc
    tracks = data.get("tracks") if isinstance(data, dict) else None
    if not isinstance(tracks, list):
        raise ManifestError("매니페스트에 tracks 목록이 없다")
    entries: list[tuple[str, str]] = []
    for track in tracks:
        tag = track.get("tag") if isinstance(track, dict) else None
        file = track.get("file") if isinstance(track, dict) else None
        if not isinstance(tag, str) or not isinstance(file, str):
            raise ManifestError(f"tag · file 이 없는 곡: {track!r}")
        for part in (tag, file):
            if not part or "/" in part or "\\" in part or part.startswith("."):
                raise ManifestError(f"경로가 될 수 없는 값: {part!r}")
        if Path(file).suffix.lower() not in AUDIO_EXTS:
            raise ManifestError(f"음원이 아닌 파일: {file!r}")
        entries.append((tag, file))
    return entries


def sync_library(force: bool = False) -> None:
    """버킷의 매니페스트대로 `BGM_DIR` 을 맞춘다 — 없는 곡은 받고, 매니페스트에서 빠진 곡은 지운다.

    `BGM_S3_PREFIX` 가 비면 아무것도 하지 않는다(로컬은 디렉터리에 둔 곡을 그대로 쓴다). `SYNC_INTERVAL_SECONDS`
    안에 다시 부르면 넘어간다. 실패해도 렌더를 막지 않는다 — 지금 있는 곡으로(없으면 BGM 없이) 간다.
    파일 이름이 같으면 다시 받지 않으므로, 곡을 바꿀 때는 새 이름으로 올린다.
    """
    global _last_sync
    prefix = config.BGM_S3_PREFIX
    if not prefix:
        return
    with _sync_lock:
        if not force and time.monotonic() - _last_sync < SYNC_INTERVAL_SECONDS:
            return
        _last_sync = time.monotonic()
        try:
            _sync(prefix)
        except Exception as exc:  # noqa: BLE001 — 음악이 없다고 무비를 실패시키지 않는다
            logger.warning("BGM 라이브러리를 맞추지 못했다 — 있는 곡으로 진행: {}", exc)
            _capture(exc)


def _sync(prefix: str) -> None:
    import storage  # boto3 — 매니페스트를 쓸 때만 필요하다

    root = _bgm_root()
    root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        manifest_path = Path(tmp) / MANIFEST_NAME
        storage.download(f"{prefix}{MANIFEST_NAME}", str(manifest_path))
        entries = parse_manifest(manifest_path.read_bytes())

    wanted = {root / tag / file for tag, file in entries}
    fetched = 0
    for tag, file in entries:
        dest = root / tag / file
        if dest.is_file():
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        partial = dest.with_name(f".{file}.part")
        storage.download(f"{prefix}{tag}/{file}", str(partial))
        partial.replace(dest)
        fetched += 1
    removed = 0
    for existing in _audio_files(root, recursive=True):
        if existing not in wanted:
            existing.unlink()
            removed += 1
    logger.info("BGM 라이브러리 {}곡 (받음 {} · 지움 {})", len(wanted), fetched, removed)


def _capture(exc: BaseException) -> None:
    import os

    if not os.environ.get("SENTRY_DSN"):
        return
    import sentry_sdk

    sentry_sdk.capture_exception(exc)


BGM_GAIN = 0.25
# 음원만 모드(원본 소리를 빼는 트렌드 숏폼)의 BGM 크기 — 마지막 손질(finalize)이 무비 전체를 -14 LUFS 로 맞추므로 1.0 이면 된다
MUSIC_ONLY_BGM_GAIN = 1.0


def mix(video_in: str, bgm_path: str, out: str, video_duration: float,
        source_gain: float = 1.0, bgm_gain: float = BGM_GAIN, end_fade: float = 0.0) -> None:
    """원본 오디오 위에 BGM 을 합성하고, 끝에서 fade-out. source_gain=0 이면 원본 소리를 빼고 BGM 만 남긴다(음원만 모드).
    end_fade 초가 있으면 섞은 소리 전체(원본 포함)를 끝에서 닫는다 — 원본 소리가 마지막 컷에서 뚝 끊기지 않게(레시피 무비)."""
    fade_start = max(video_duration - 2.0, 0.0)
    bg = f"[1:a]volume={bgm_gain:g},afade=t=out:st={fade_start:.2f}:d=2,atrim=0:{video_duration:.2f}"
    if source_gain == 0:
        fc = f"{bg},aresample=48000,aformat=channel_layouts=stereo[a]"
    elif source_gain == 1.0:
        # 지금까지의 무비와 같은 섞기(amix 의 기본 정규화 포함) — 기본값이 결과를 바꾸지 않게
        fc = f"{bg}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0[a]"
    else:
        fc = f"{bg}[bg];[0:a]volume={source_gain:g}[src];[src][bg]amix=inputs=2:duration=first:dropout_transition=0[a]"
    if end_fade:
        fc = fc[:-len("[a]")] + f",afade=t=out:st={max(video_duration - end_fade, 0.0):.2f}:d={end_fade:g}[a]"
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", video_in,
            "-stream_loop", "-1", "-i", bgm_path,  # BGM이 짧으면 반복
            "-filter_complex", fc,
            "-map", "0:v:0", "-map", "[a]",
            "-c:v", "copy", "-c:a", "aac", "-shortest", out,
        ],
        capture_output=True, text=True, check=True,
    )
    logger.info("BGM 합성 완료 track={}", Path(bgm_path).name)


def apply_bgm(video_in: str, tag: str, out: str, video_duration: float, key: str,
              source_gain: float = 1.0, bgm_gain: float = BGM_GAIN) -> tuple[str, bool]:
    """BGM 합성 시도. `key` 는 곡을 고정하는 값(무비 id). 반환: (결과 경로, BGM 적용 여부).

    합성이 실패하면 BGM 없이 간다(backlog E-51) — 컷을 다 붙인 뒤라 무비 전체를 실패시키면 처음부터 다시 돈다.
    곡이 없을 때와 같은 결과다.
    """
    sync_library()
    track = pick_track(tag, key)
    if track is None:
        return video_in, False
    try:
        mix(video_in, track, out, video_duration, source_gain, bgm_gain)
    except subprocess.CalledProcessError as exc:
        logger.warning("BGM 합성 실패 — BGM 없이 진행 (track={}): {}", Path(track).name, (exc.stderr or "")[-300:])
        _capture(exc)
        return video_in, False
    return out, True
