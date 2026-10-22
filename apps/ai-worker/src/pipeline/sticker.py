"""이모지 스티커 배치 — 컷의 내용 개념에서 이모지를 골라 피사체 둘레에 차례로 붙인다(렌더는 `pipeline/sticker_render.py`).

- 무엇을: 사전 `stickers.byConcept`(하위 개념은 상위의 목록을 물려받음). 분위기가 sparkleMoods 면 반짝이를 더한다
- 몇 개: 1 + (컷이 2박 이상이면 1) + (시드로 0~1), 후보 수를 넘지 않는다
- 어디에: 피사체 가장자리에 반쯤 걸치게(object.beside 의 위 · 아래 변형) → 피사체 위 → 화면 빈 모서리.
  같은 컷의 텍스트 액센트와 앞서 붙인 스티커를 피한다. 피사체 상자가 없으면 빈 모서리만
- 언제: 반 박자씩 늦게 하나씩, holdBeats 박자 머묾

결정론과 시드는 `pipeline/text_accent.py` 와 같다(같은 style-director 스테이지 시드).
"""

from dataclasses import dataclass

from pipeline import accent_fit, layout
from pipeline import text_accent as ta

STICKERS: dict = ta.VOCABULARY["stickers"]
MOTIONS: tuple[str, ...] = tuple(STICKERS["motions"])


@dataclass(frozen=True)
class Sticker:
    cut_id: str
    emoji: str
    reason: str
    anchor: str
    xy: tuple[float, float]
    size_px: int
    rotation: float
    motion: str
    start_ms: int
    end_ms: int
    beats: tuple[int, ...]


def candidates(cut: ta.CutContext, mood: str) -> list[tuple[str, str]]:
    """(코드포인트, 근거) — 행동 · 사물 · 장소 · 주제 · 분위기 순, 같은 이모지는 한 번."""
    found, seen = [], set()
    for fld in ("actions", "objects", "places", "topics", "moods"):
        table = STICKERS["byConcept"].get(fld, {})
        for concept in cut.concepts.get(fld, ()):
            for ancestor in sorted(ta.lineage(fld, concept), key=lambda c: c != concept):
                for cp in table.get(ancestor, ()):
                    if cp not in seen:
                        seen.add(cp)
                        found.append((cp, f"{fld}:{concept}"))
    if mood in STICKERS["sparkleMoods"]:
        found += [(cp, f"moods:{mood} (반짝이)") for cp in STICKERS["sparkle"] if cp not in seen]
    return found


def spots(subject: layout.Box | None, size: float) -> list[tuple[str, tuple[float, float]]]:
    sx, sy = size / layout.W, size / layout.H
    x0, y0, x1, y1 = layout.SAFE
    free = [
        ("freezone.bottomRight", (x1 - sx * 0.7, y1 - sy * 0.8)), ("freezone.bottomLeft", (x0 + sx * 0.7, y1 - sy * 0.8)),
        ("freezone.topRight", (x1 - sx * 0.7, y0 + sy * 0.8)), ("freezone.topLeft", (x0 + sx * 0.7, y0 + sy * 0.8)),
    ]
    if subject is None:
        return free
    a, b, c, d = subject
    hug = [  # 가장자리에 걸치는 자리 — 스티커 폭의 15~20% 가 피사체 안으로 들어간다
        ("object.beside", (c - sx * 0.15, b - sy * 0.1)), ("object.beside", (a + sx * 0.15, b - sy * 0.1)),
        ("object.beside", (c - sx * 0.1, d - sy * 0.2)), ("object.beside", (a + sx * 0.1, d - sy * 0.2)),
    ]
    return hug + [("object.beside", (c + sx * 0.6, (b + d) / 2)), ("object.beside", (a - sx * 0.6, (b + d) / 2))] + free


def plan_cut(cut: ta.CutContext, accent: ta.Accent | None, beats: accent_fit.Beats, stage_seed: int,
             previous: frozenset[str] = frozenset(), energy: str = accent_fit.MID,
             generated: tuple[str, ...] = ()) -> list[Sticker]:
    mood = accent.palette if accent is not None else ta.palette_for(cut)
    # 생성(층 c)이 고른 이모지가 먼저, 그 뒤에 사전 후보
    own = [(cp, "생성") for cp in generated]
    # 바로 앞 컷에 붙인 이모지는 뒤로 — 같은 장면이 이어져도 스티커가 똑같이 반복되지 않게
    rest = sorted((item for item in candidates(cut, mood) if item[0] not in generated),
                  key=lambda item: item[0] in previous)
    found = own + rest
    if not found:
        return []
    grid = accent_fit.as_grid(beats, cut.end_ms + 8 * (beats if isinstance(beats, int) else 500))
    beats_in_cut = max(1, sum(1 for b in grid if cut.start_ms <= b < cut.end_ms))
    want = min(len(found), 1 + (beats_in_cut >= 2) + ta.roll(stage_seed, cut.cut_id, "stk-n") % 2)
    # 사전 후보는 앞쪽 둘 중 어디서 시작할지만 시드로 — 생성(층 c)이 고른 이모지는 그 앞에 그대로
    offset = ta.roll(stage_seed, cut.cut_id, "stk-pick") % min(2, len(rest)) if rest else 0
    order = own + rest[offset:] + rest[:offset]
    taken = [accent.rect] if accent is not None else []
    placed: list[Sticker] = []
    for i, (cp, reason) in enumerate(order[:want]):
        sticker = _place_one(cut, cp, reason, i, taken, grid, stage_seed, energy)
        if sticker is not None:
            placed.append(sticker)
            taken.append(_sticker_rect(sticker))
    return placed


def _place_one(cut, cp, reason, i, taken, grid, stage_seed, energy) -> Sticker | None:
    low, high = STICKERS["sizePx"]
    size = low + ta.roll(stage_seed, cut.cut_id, "stk-size", str(i)) % (high - low)
    options = spots(cut.subject, size)
    # 걸치는 네 자리 중 어디서 시작할지를 시드로 — 컷마다 붙는 쪽이 바뀐다
    k = ta.roll(stage_seed, cut.cut_id, "stk-spot", str(i)) % 4 if cut.subject is not None else 0
    options = options[k:4] + options[:k] + options[4:]
    for anchor, xy in options:
        r = _box(xy, size)
        if layout.fits_at(r, taken):
            beat = accent_fit.interval_at(grid, cut.start_ms)
            start = cut.start_ms + i * beat // 2
            end = min(cut.end_ms + beat // 2, start + STICKERS["holdBeats"] * beat)
            return Sticker(
                cut.cut_id, cp, reason, anchor, xy, size,
                round(ta.unit(stage_seed, cut.cut_id, "stk-rot", str(i)) * STICKERS["tiltDeg"], 1),
                _motion(stage_seed, cut.cut_id, i, energy),
                start, end, accent_fit.relative_beats(grid, start, end),
            )
    return None


def _motion(stage_seed: int, cut_id: str, index: int, energy: str) -> str:
    """빠른 컷은 돌고 흔들리고, 잔잔한 컷은 떠오르고 통통 — 그 안에서 시드로."""
    pool = STICKERS["energyMotions"].get(energy, MOTIONS)
    return pool[ta.roll(stage_seed, cut_id, "stk-motion", str(index)) % len(pool)]


def _box(xy: tuple[float, float], size: float) -> layout.Box:
    # 이모지 그림은 정사각 캔버스보다 조금 작다 — 90% 로 잰다
    return layout.rect_around(xy, size / layout.W * 0.9, size / layout.H * 0.9)


def _sticker_rect(sticker: Sticker) -> layout.Box:
    return _box(sticker.xy, sticker.size_px)


def plan(cuts: list[ta.CutContext], accents: list[ta.Accent], beats: accent_fit.Beats, stage_seed: int,
         emoji_overrides: dict[str, tuple[str, ...]] | None = None) -> list[Sticker]:
    by_cut = {a.cut_id: a for a in accents}
    placed: list[Sticker] = []
    previous: frozenset[str] = frozenset()
    energy_of = dict(zip((c.cut_id for c in cuts), accent_fit.energies([c.motion for c in cuts])))
    for cut in cuts:
        these = plan_cut(cut, by_cut.get(cut.cut_id), beats, stage_seed, previous, energy_of[cut.cut_id],
                         (emoji_overrides or {}).get(cut.cut_id, ()))
        placed += these
        previous = frozenset(s.emoji for s in these)
    return placed
