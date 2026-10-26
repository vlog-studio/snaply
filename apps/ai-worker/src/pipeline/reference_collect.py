"""레퍼런스 말뭉치 수집 — 릴스 · 틱톡 · 쇼츠의 목록(해시태그 피드 · 계정 · 단일 영상 URL)에서 인기 숏브이로그를 골라 받고 시트에 적는다.

오프라인 R&D 전용이다(docs/decisions/trend-recipes.md §13). 받는 일은 yt-dlp 가 한다 — 운영 이미지에는 없고 연구용 의존성
(`requirements-research.txt`)이라 받는 함수 안에서만 불러온다. 고르는 규칙(`skip_reason`) · 시트 한 줄(`sheet_row`)은 순수 함수다.

- 플랫폼은 URL 의 호스트로 정한다(`platform_of`)
- 목록은 평평하게(flat) 훑고, 고를 만한 것만 메타데이터를 다시 읽어 길이 · 업로드일 · 조회수로 거른 뒤 받는다
- 요청 사이에 쉰다(`SLEEP_S`) — 플랫폼에 부담을 주지 않고 차단을 피한다
"""

import re
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

from loguru import logger

HOSTS = {"instagram.com": "instagram", "tiktok.com": "tiktok", "youtube.com": "youtube_shorts", "youtu.be": "youtube_shorts"}
ID_PREFIX = {"instagram": "ig", "tiktok": "tt", "youtube_shorts": "yt"}
UNSAFE = re.compile(r"[^A-Za-z0-9_-]")
SLEEP_S = (2.0, 5.0)  # 요청 사이 쉬는 범위(초)
MAX_HEIGHT = 1080


@dataclass(frozen=True)
class Rules:
    max_duration_s: float = 90.0
    min_views: int = 10_000
    since_days: int | None = 60  # None 이면 업로드일을 보지 않는다


def platform_of(url: str) -> str | None:
    host = re.sub(r"^https?://", "", url).split("/")[0].lower()
    return next((p for h, p in HOSTS.items() if host == h or host.endswith("." + h)), None)


def row_id(platform: str, video_id: str) -> str:
    """시트 · 파일 이름의 id — 플랫폼 접두사 + 플랫폼 id(안전하지 않은 글자는 _). 64자 안."""
    return f"{ID_PREFIX[platform]}-{UNSAFE.sub('_', video_id)}"[:64]


def _uploaded(info: Mapping) -> date | None:
    raw = info.get("upload_date")
    return datetime.strptime(raw, "%Y%m%d").date() if raw else None


def skip_reason(info: Mapping, rules: Rules, today: date) -> str | None:
    """고르지 않는 이유 — 없으면 None. 모르는 값(None)은 그 규칙으로 거르지 않는다."""
    duration, views, uploaded = info.get("duration"), info.get("view_count"), _uploaded(info)
    if duration is not None and duration > rules.max_duration_s:
        return f"길이 {duration:.0f}초 > {rules.max_duration_s:.0f}초"
    if views is not None and views < rules.min_views:
        return f"조회수 {views} < {rules.min_views}"
    if rules.since_days is not None and uploaded is not None and uploaded < today - timedelta(days=rules.since_days):
        return f"업로드 {uploaded} — {rules.since_days}일보다 오래됨"
    return None


def sheet_row(info: Mapping, platform: str) -> dict[str, str]:
    """받은 영상의 시트 한 줄 — 사람 라벨 칸은 비워 둔다(사람이 본 뒤 채운다)."""
    uploaded = _uploaded(info)
    count = {key: "" if info.get(key) is None else str(int(info[key])) for key in ("view_count", "like_count", "channel_follower_count")}
    return {
        "id": row_id(platform, str(info["id"])), "platform": platform, "capture": "download",
        "url": info.get("webpage_url") or info.get("original_url") or "", "uploaded_at": uploaded.isoformat() if uploaded else "",
        "views": count["view_count"], "likes": count["like_count"],
        "followers": count["channel_follower_count"], "music": info.get("track") or "",
        "note": (info.get("uploader") or info.get("channel") or "")[:80],
    }


# ── 받기(yt-dlp) ─────────────────────────────────────────────────────
def _options(cookies_browser: str | None, extra: Mapping | None = None) -> dict:
    opts = {"quiet": True, "no_warnings": True, "sleep_interval_requests": SLEEP_S[0],
            "sleep_interval": SLEEP_S[0], "max_sleep_interval": SLEEP_S[1]}
    if cookies_browser:
        opts["cookiesfrombrowser"] = (cookies_browser,)
    return {**opts, **(extra or {})}


def entries(source: str, limit: int, cookies_browser: str | None) -> Iterator[str]:
    """목록 URL 의 영상 URL 들(단일 영상이면 그 하나) — 앞에서부터 limit 개."""
    import yt_dlp  # noqa: PLC0415 — 연구용 의존성

    opts = _options(cookies_browser, {"extract_flat": "in_playlist", "playlistend": limit})
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(source, download=False)
    if info.get("_type") != "playlist":
        yield source  # 단일 영상 — info 의 url 은 CDN 파일 주소라 다시 읽으면 403 이다
        return
    for item in list(info.get("entries") or [])[:limit]:
        url = item.get("url") or item.get("webpage_url")
        if url:
            yield url


def probe(url: str, cookies_browser: str | None) -> dict:
    """한 영상의 메타데이터(받지 않는다)."""
    import yt_dlp  # noqa: PLC0415 — 연구용 의존성

    with yt_dlp.YoutubeDL(_options(cookies_browser, {"noplaylist": True})) as ydl:
        return ydl.extract_info(url, download=False)


def download(info: dict, out_dir: Path, file_id: str, cookies_browser: str | None) -> None:
    """probe 한 영상을 out_dir/<file_id>.mp4 로 받는다(1080p 이하, mp4 로 합친다)."""
    import yt_dlp  # noqa: PLC0415 — 연구용 의존성

    opts = _options(cookies_browser, {
        "format": f"bv*[height<={MAX_HEIGHT}]+ba/b[height<={MAX_HEIGHT}]/b", "merge_output_format": "mp4",
        "outtmpl": str(out_dir / f"{file_id}.%(ext)s"), "noplaylist": True,
    })
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.process_ie_result(info, download=True)
    logger.debug("받음: {}", file_id)
