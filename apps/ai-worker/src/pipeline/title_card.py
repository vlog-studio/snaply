"""고정 타이틀 — 트렌드 숏브이로그가 컷마다 글을 붙이는 대신 쓰는 화면 고정 글 하나("vlog / working day").

레퍼런스(docs/decisions/trend-recipes.md)의 두 모양:

- `typewriter` — 왼쪽에 큰 소문자 "vlog", 오른쪽에 작은 부제. 타자기체(D2Coding). 무비 내내
- `script` — 손글씨(Gaegu) "Mini VLog" 와 "in {장소}!!". 처음 몇 초만
- `cinematic` — 레터박스 띠 안 왼쪽에 굵은 "Vlog", 오른쪽에 작은 "@{장소} !", 마지막 1.5초는 "See ya !<3"(2026-10-22 레퍼런스 ⑤ —
  "숏브이로그 in 대전"). 장소가 '실내' · '야외' 처럼 흔한 말이면 부제를 쓴다. 컷 구간을 받으면 오른쪽 글이 컷마다 그 컷의 멘트로
  바뀐다(`cut_comments` — 2026-10-29, trend-recipes.md §15)

부제 · 장소는 스냅 분석에서 만든다 — 컷들의 분석 `topics` · `places` 자유 문자열 중 가장 자주 나온 것(같으면 먼저 나온 것).
분석이 없으면 부제는 "daily", 장소는 비운다.
"""

from collections import Counter
from datetime import datetime

from pipeline import ass

TYPEWRITER, SCRIPT, CINEMATIC = "typewriter", "script", "cinematic"
STYLES = (TYPEWRITER, SCRIPT, CINEMATIC)
OUTRO_MS = 1500
GENERIC_PLACES = ("실내", "야외", "실외", "거리", "도로", "집", "방", "건물", "실내 공간", "야외 공간")
MAX_CHARS = 14
FADE_MS = 300
CUT_COMMENT_MIN_MS = 900  # 한 멘트가 머무는 최소 시간 — 시네마틱 컷(중앙값 0.94초)마다 바뀌되 더 짧은 컷에서는 앞 멘트가 이어진다(§15)
CUT_COMMENT_FADE_MS = 150


def _most_common(analyses: list[dict], field: str) -> str | None:
    values = [" ".join(v.split()) for a in analyses for v in (a.get(field) or []) if v and v.strip()]
    if not values:
        return None
    counts = Counter(values)
    best = max(counts.values())
    return next(v for v in values if counts[v] == best)[:MAX_CHARS]


def words(analyses: list[dict]) -> tuple[str, str]:
    """(부제, 장소) — 분석에서."""
    return _most_common(analyses, "topics") or "daily", _most_common(analyses, "places") or ""


def _clean(value: str) -> str:
    return " ".join(value.split())[:MAX_CHARS]


def _candidates(analysis: dict) -> list[str]:
    """한 컷의 멘트 후보 — 행동 → 사물 → 장소(흔한 장소 제외, `@장소 !`) → 주제 순."""
    out = []
    for field in ("actions", "objects", "places", "topics"):
        for value in analysis.get(field) or []:
            word = _clean(value) if value else ""
            if not word or (field == "places" and word in GENERIC_PLACES):
                continue
            out.append(f"@{word} !" if field == "places" else word)
    return out


def cut_comments(tag: str, analyses: list[dict], cuts: list[tuple[int, int]], until: int) -> list[tuple[int, int, str]]:
    """(시작, 끝, 멘트) — 첫 멘트는 무비 태그, 다음 컷부터 그 컷에서 아직 안 나온 말. 한 멘트는 CUT_COMMENT_MIN_MS 이상 머물고,
    그보다 짧은 컷이나 새 말이 없는 컷에서는 앞 멘트가 이어진다. 구간은 until(엔딩 시작)에서 끊는다."""
    spans = [[0, until, tag]]
    used = {tag}
    for (start, stop), analysis in zip(cuts, analyses):
        if start <= 0 or start >= until or start - spans[-1][0] < CUT_COMMENT_MIN_MS:
            continue
        if min(stop, until) - start < CUT_COMMENT_MIN_MS:
            continue  # 짧은 컷의 말은 다음 컷 위에 남아 화면과 어긋나고, 엔딩 앞에서는 잠깐 비치고 만다
        word = next((w for w in _candidates(analysis) if w not in used), None)
        if word is None:
            continue
        spans[-1][1] = start
        spans.append([start, until, word])
        used.add(word)
    return [(a, b, text) for a, b, text in spans if b > a]


def styles() -> list[ass.Style]:
    shadow = dict(outline=0, shadow=3, back_colour="000000", back_alpha=0x90, alignment=5)
    return [
        ass.Style("TitleBig", "D2Coding", 112, bold=True, **shadow),
        ass.Style("TitleSmall", "D2Coding", 40, bold=True, **shadow),
        ass.Style("ScriptBig", "Gaegu", 120, primary="FF8FB8", outline_colour="FFFFFF", outline=6, shadow=2, alignment=5),
        ass.Style("ScriptSmall", "Gaegu", 56, primary="FFFFFF", outline_colour="FF8FB8", outline=4, shadow=2, alignment=5),
        ass.Style("CineBig", "Pretendard GOV", 104, bold=True, outline=0, shadow=2, back_colour="000000", back_alpha=0xA0, alignment=5),
        ass.Style("Stamp", "D2Coding", 54, bold=True, outline=0, shadow=3, back_colour="000000", back_alpha=0x80, alignment=1),
        ass.Style("FreezeBig", "Black Han Sans", 150, primary="FFFFFF", outline_colour="111111", outline=8, shadow=0, alignment=5),
        ass.Style("CineSmall", "Pretendard GOV", 38, bold=True, outline=0, shadow=2, back_colour="000000", back_alpha=0xA0, alignment=5),
    ]


def events(style: str, analyses: list[dict], movie_ms: int, hold_ms: int | None,
           cuts: list[tuple[int, int]] | None = None) -> list[str]:
    """cuts 는 analyses 와 같은 순서의 컷 구간(무비 시간축) — 시네마틱만 쓴다(오른쪽 글을 컷마다)."""
    if style not in STYLES:
        raise ValueError(f"알 수 없는 타이틀 모양입니다: {style}")
    end = movie_ms if hold_ms is None else min(movie_ms, hold_ms)
    subtitle, place = words(analyses)
    fade = f"\\fad({FADE_MS},{FADE_MS if hold_ms is not None else 0})"
    w, h = ass.PLAY_RES_X, ass.PLAY_RES_Y
    if style == TYPEWRITER:
        big = f"{{\\an4\\pos({round(w * 0.08)},{round(h * 0.47)}){fade}}}vlog"
        small = f"{{\\an6\\pos({round(w * 0.86)},{round(h * 0.47)}){fade}}}{ass.escape_text(subtitle)}"
        return [ass.dialogue(0, end, "TitleBig", big), ass.dialogue(0, end, "TitleSmall", small)]
    if style == CINEMATIC:
        mid = round(h * 0.5)  # 레터박스 띠의 가운데(cut_fx.LETTERBOX)
        tag = place if place and place not in GENERIC_PLACES else subtitle
        big = f"{{\\an4\\pos({round(w * 0.06)},{mid}){fade}}}Vlog"
        until = max(0, movie_ms - OUTRO_MS)
        right = f"\\an6\\pos({round(w * 0.94)},{mid})"
        spans = cut_comments(f"@{tag} !", analyses, cuts, until) if cuts else [(0, until, f"@{tag} !")]
        lines = [ass.dialogue(0, movie_ms, "CineBig", big)]
        for start, stop, text in spans:
            fad = fade if start == 0 else f"\\fad({CUT_COMMENT_FADE_MS},0)"
            lines.append(ass.dialogue(start, stop, "CineSmall", f"{{{right}{fad}}}{ass.escape_text(text)}"))
        outro = f"{{{right}\\fad(150,0)}}See ya !<3"
        return lines + [ass.dialogue(until, movie_ms, "CineSmall", outro)]
    big = f"{{\\an5\\pos({round(w * 0.46)},{round(h * 0.40)}){fade}\\frz-4}}Mini VLog"
    lines = [ass.dialogue(0, end, "ScriptBig", big)]
    if place:
        small = f"{{\\an5\\pos({round(w * 0.56)},{round(h * 0.40) + 110}){fade}}}in {ass.escape_text(place)}!!"
        lines.append(ass.dialogue(0, end, "ScriptSmall", small))
    return lines


def stamp_text(at: datetime) -> str:
    """'AM 9:12' — 하루 타임스탬프 포맷의 글(촬영 시각, 그 사진이 찍힌 곳의 시각 그대로)."""
    hour = at.hour % 12 or 12
    return f"{'AM' if at.hour < 12 else 'PM'} {hour}:{at.minute:02d}"


def timestamps(cuts: list[tuple[int, int]], times: list[datetime | None]) -> list[str]:
    """컷마다 촬영 시각 — 화면 아래 왼쪽(세이프 에어리어 안), 컷 동안. 시각을 모르는 컷은 비운다."""
    w, h = ass.PLAY_RES_X, ass.PLAY_RES_Y
    out = []
    for (start, end), at in zip(cuts, times):
        if at is None:
            continue
        text = f"{{\\an1\\pos({round(w * 0.08)},{round(h * 0.76)})\\fad(120,0)}}{stamp_text(at)}"
        out.append(ass.dialogue(start, end, "Stamp", text))
    return out


def freeze_labels(holds: list[tuple[int, int, str]]) -> list[str]:
    """프리즈 + 텍스트 포맷 — 멈춘 동안 화면 위쪽 가운데에 큰 글(그 컷의 의성어, 없으면 '!'). 살짝 커지며 등장."""
    w, h = ass.PLAY_RES_X, ass.PLAY_RES_Y
    out = []
    for at, ms, label in holds:
        text = (f"{{\\an5\\pos({round(w * 0.5)},{round(h * 0.30)})\\fscx70\\fscy70\\t(0,120,\\fscx100\\fscy100)}}"
                f"{ass.escape_text(label)}")
        out.append(ass.dialogue(at, at + ms, "FreezeBig", text))
    return out
