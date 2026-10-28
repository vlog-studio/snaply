"""고정 타이틀 — 트렌드 숏브이로그가 컷마다 글을 붙이는 대신 쓰는 화면 고정 글 하나("vlog / working day").

레퍼런스(docs/decisions/trend-recipes.md)의 두 모양:

- `typewriter` — 왼쪽에 큰 소문자 "vlog", 오른쪽에 작은 부제. 타자기체(D2Coding). 무비 내내
- `script` — 손글씨(Gaegu) "Mini VLog" 와 "in {장소}!!". 처음 몇 초만
- `cinematic` — 레터박스 띠 안 왼쪽에 굵은 "Vlog", 오른쪽에 작은 "@{장소} !", 마지막 1.5초는 "See ya !<3"(2026-10-22 레퍼런스 ⑤ —
  "숏브이로그 in 대전"). 장소가 '실내' · '야외' 처럼 흔한 말이면 부제를 쓴다

부제 · 장소는 무비 전체를 대표해야 한다 — 컷들의 분석 `topics` · `places` 에서 ① 두 컷 이상에 나온 같은 문자열(가장 많은 것, 같으면 먼저 나온 것),
② 없으면 내용 개념(content-vocabulary)으로 묶어 상위 개념까지 쳐서 가장 많은 컷이 공유하는 개념(두 컷 이상, 같으면 더 구체적인 것)의 이름,
③ 그래도 없으면 부제는 "daily", 장소는 비운다. 분석이 있는 컷이 하나뿐이면 그 컷의 첫 값. 문자열이 컷마다 다르면 첫 컷의 값이 뽑혀
여행 전체를 대표하지 못했다(운영 2026-10-28 "@암석 지형 !" — 몽골 여행 8컷).
"""

from collections import Counter
from datetime import datetime

from pipeline import ass, content

TYPEWRITER, SCRIPT, CINEMATIC = "typewriter", "script", "cinematic"
STYLES = (TYPEWRITER, SCRIPT, CINEMATIC)
OUTRO_MS = 1500
GENERIC_PLACES = ("실내", "야외", "실외", "거리", "도로", "집", "방", "건물", "실내 공간", "야외 공간")
MAX_CHARS = 14
FADE_MS = 300


def _values(analysis: dict, field: str) -> list[str]:
    return [" ".join(v.split()) for v in (analysis.get(field) or []) if v and v.strip()]


def _lineage(field: str, concept: str) -> list[str]:
    """개념과 그 상위 개념들(가까운 것부터)."""
    concepts, chain = content.VOCABULARY["concepts"][field], []
    while concept and concept not in chain:
        chain.append(concept)
        concept = concepts[concept].get("parent")
    return chain


def _shared_concept(analyses: list[dict], field: str) -> str | None:
    """두 컷 이상이 공유하는 개념(상위 개념까지)의 이름 — 가장 많은 컷, 같으면 더 구체적인(깊은) 것, 그래도 같으면 먼저 나온 것."""
    support: Counter = Counter()
    depth: dict[str, int] = {}
    order: list[str] = []
    for analysis in analyses:
        seen: set[str] = set()
        for concept in content.normalize_values(field, _values(analysis, field)):
            chain = _lineage(field, concept)
            for k, c in enumerate(chain):
                depth[c] = max(depth.get(c, 0), len(chain) - k)
                seen.add(c)
                if c not in order:
                    order.append(c)
        support.update(seen)
    shared = [c for c in order if support[c] >= 2]
    if not shared:
        return None
    best = max(shared, key=lambda c: (support[c], depth[c], -order.index(c)))
    return content.VOCABULARY["concepts"][field][best]["label"]


def _representative(analyses: list[dict], field: str) -> str | None:
    per_cut = [_values(a, field) for a in analyses]
    with_values = [v for v in per_cut if v]
    if not with_values:
        return None
    if len(with_values) == 1:
        return with_values[0][0][:MAX_CHARS]
    counts = Counter(v for values in per_cut for v in dict.fromkeys(values))  # 컷마다 한 번
    flat = [v for values in per_cut for v in values]
    best = max(counts.values())
    if best >= 2:
        return next(v for v in flat if counts[v] == best)[:MAX_CHARS]
    shared = _shared_concept(analyses, field)
    return shared[:MAX_CHARS] if shared else None


def words(analyses: list[dict]) -> tuple[str, str]:
    """(부제, 장소) — 분석에서, 무비 전체를 대표하는 값."""
    return _representative(analyses, "topics") or "daily", _representative(analyses, "places") or ""


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


def events(style: str, analyses: list[dict], movie_ms: int, hold_ms: int | None) -> list[str]:
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
        small = f"{{\\an6\\pos({round(w * 0.94)},{mid}){fade}}}@{ass.escape_text(tag)} !"
        outro = f"{{\\an6\\pos({round(w * 0.94)},{mid})\\fad(150,0)}}See ya !<3"
        return [ass.dialogue(0, movie_ms, "CineBig", big), ass.dialogue(0, until, "CineSmall", small),
                ass.dialogue(until, movie_ms, "CineSmall", outro)]
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
