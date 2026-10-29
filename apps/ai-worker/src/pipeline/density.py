"""글 · 스티커를 아껴 쓰기 — 레시피의 accents · stickers 밀도를 계획에 적용한다.

트렌드 숏브이로그는 컷마다 글 · 이모지를 붙이지 않는다(docs/decisions/trend-recipes.md). 그래서:

- 사전 글은 매칭 점수가 minScore 이상만(행동 · 사물 하나가 3 — 장소 · 분위기만 맞은 것은 빠진다), 장소 키워드는 keyword 일 때만
- 남은 것 중 점수가 높은 순으로, 서로 gapMs(없으면 MIN_GAP_MS) 안에 몰리지 않게, max 가 있으면 거기까지
- 스티커는 글이 남은 컷에만, 컷마다 perCut 개 · 무비에 maxPerMovie 개까지 — 강한 순간에만 붙는다
- 글자를 끄고 이모지만 켠 무비는 글 대신 gate(글의 문턱 · 간격)로 스티커가 스스로 컷을 고른다 — 컷에서 가장 센 스티커 근거 필드의 무게가
  minScore 이상인 컷을 점수 높은 순으로 gapMs 떨어지게(text-accent-stickers.md §9)

에이전트(b) · 생성(c) 글은 점수가 없으므로 문턱을 지난 것으로 보고 상한에만 센다.
"""

from pipeline import text_accent as ta
from pipeline.sticker import Sticker

MIN_GAP_MS = 4000


def score(accent: ta.Accent, cut: ta.CutContext) -> int:
    if accent.choice.source == ta.DICTIONARY:
        return ta.match(ta.ACCENTS[accent.choice.accent_id], cut)[0]
    if accent.choice.source == ta.KEYWORD:
        return 0
    return 99


def limit_accents(accents: list[ta.Accent], cuts: list[ta.CutContext], cfg: dict) -> list[ta.Accent]:
    by_cut = {c.cut_id: c for c in cuts}
    kept = [(score(a, by_cut[a.cut_id]), a) for a in accents]
    kept = [(s, a) for s, a in kept
            if (a.choice.source == ta.KEYWORD and cfg.get("keyword", True))
            or (a.choice.source != ta.KEYWORD and s >= cfg.get("minScore", 1))]
    limit = cfg.get("max")
    # 간격: 레시피의 gapMs, 없으면 상한이 있을 때만 MIN_GAP_MS(상한도 간격도 없으면 문턱만 — classic)
    gap = cfg.get("gapMs") or (MIN_GAP_MS if limit is not None else 0)
    if limit is None and not gap:
        return [a for _, a in kept]
    chosen: list[ta.Accent] = []
    for _, accent in sorted(kept, key=lambda item: (-item[0], item[1].start_ms)):
        if limit is not None and len(chosen) >= limit:
            break
        # 몰리지 않게, 그리고 같은 글은 한 편에 한 번만(간격을 쓰는 레시피 — '냠냠' 이 두 번 나왔다, 2026-10-22)
        if all(abs(accent.start_ms - other.start_ms) >= gap and accent.choice.text != other.choice.text for other in chosen):
            chosen.append(accent)
    return sorted(chosen, key=lambda a: a.start_ms)


def sticker_score(sticker: Sticker) -> int:
    """스티커 근거(`필드:개념`)의 필드 무게 — 글의 매칭 무게와 같다. 생성(층 c) 이모지는 문턱을 지난 것으로 본다."""
    field = sticker.reason.split(":", 1)[0]
    return ta.VOCABULARY["fieldWeights"].get(field, 99 if sticker.reason == "생성" else 0)


def sticker_cuts(stickers: list[Sticker], gate: dict) -> set[str]:
    """글 없이 이모지만 붙일 때 스티커가 붙을 컷 — 컷에서 가장 센 스티커 점수가 문턱 이상인 컷을, 점수 높은 순으로 서로 간격을 두고."""
    best: dict[str, tuple[int, int]] = {}  # 컷 → (점수, 첫 등장)
    for sticker in stickers:
        score_, start = best.get(sticker.cut_id, (0, sticker.start_ms))
        best[sticker.cut_id] = (max(score_, sticker_score(sticker)), min(start, sticker.start_ms))
    gap = gate.get("gapMs") or 0
    chosen: list[tuple[str, int]] = []
    for cut_id, (score_, start) in sorted(best.items(), key=lambda item: (-item[1][0], item[1][1])):
        if score_ >= gate.get("minScore", 1) and all(abs(start - other) >= gap for _, other in chosen):
            chosen.append((cut_id, start))
    return {cut_id for cut_id, _ in chosen}


def limit_stickers(stickers: list[Sticker], accents: list[ta.Accent], cfg: dict, gate: dict | None = None) -> list[Sticker]:
    """gate 가 없으면 글이 남은 컷에만(상한이 없는 classic 은 그대로), 있으면 sticker_cuts 가 고른 컷에만."""
    per_cut, per_movie = cfg.get("perCut"), cfg.get("maxPerMovie")
    if per_cut == 0 or per_movie == 0:
        return []
    if gate is None and per_cut is None and per_movie is None:
        return stickers
    allowed = sticker_cuts(stickers, gate) if gate is not None else {a.cut_id for a in accents}
    kept, counts = [], {}
    for sticker in stickers:
        if sticker.cut_id not in allowed:
            continue
        if per_cut is not None and counts.get(sticker.cut_id, 0) >= per_cut:
            continue
        counts[sticker.cut_id] = counts.get(sticker.cut_id, 0) + 1
        kept.append(sticker)
    return kept if per_movie is None else kept[:per_movie]
