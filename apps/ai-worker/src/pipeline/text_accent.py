"""텍스트 액센트 — 컷의 내용 개념에서 의성어 · 느낌 · 감탄 · 키워드를 골라 색 · 자리 · 박자 · 모션을 정한다.

고르는 층은 셋이고 아래 층이 위 층의 폴백이다(docs/decisions/text-accent-stickers.md §2):

- a 사전 — `accent-vocabulary.json` 의 개념 매칭. 항상 답을 낸다(키워드까지)
- b 에이전트 — 무비 전체를 본 에이전트가 사전 후보 id 를 고른다(`Override.accent_id`)
- c 생성 — LLM 이 만든 글(`Override.text`). `validate_generated` 를 지나야 하고, 아니면 버리고 a 로

결정론: 모든 선택은 `sha256("{stage_seed}:{cut_id}:{축}")` 으로만 갈린다 — stage_seed 는 `seed.derive_stage_seed(root, "style-director", attempt)`.
피사체 상자(`subject`)가 없으면 피사체 기준 자리(object.*)를 건너뛰고 빈 영역(freezone · safeArea)만 쓴다.
영상에 맞추는 규칙(움직임 → 모션 · 등장 시각, 배경 밝기 → 대비)은 `pipeline/accent_fit.py`. 그 입력이 없으면 사전 값 그대로다.
"""

import hashlib
from dataclasses import dataclass, field

from pipeline import accent_fit
from pipeline import vocabulary as _vocabulary
from pipeline import layout
from pipeline.layout import GAP, H, W, Box, fits_at, rect_around

VOCABULARY: dict = _vocabulary.load("accent-vocabulary.json")
CONTENT: dict = _vocabulary.load("content-vocabulary.json")

ACCENT_VOCABULARY_VERSION: int = VOCABULARY["accentVocabularyVersion"]
CATEGORIES: dict[str, dict] = VOCABULARY["categories"]
ACCENTS: dict[str, dict] = VOCABULARY["accents"]
MOTIONS: tuple[str, ...] = tuple(VOCABULARY["motions"])
GENERATED: dict = VOCABULARY["generated"]

DICTIONARY, AGENT, GENERATED_SOURCE, KEYWORD = "dictionary", "agent", "generated", "keyword"
# 생성 글의 기본 모션 — 그다음 에너지가 바꿀 수 있다(accent_fit.motion_for)
GENERATED_MOTION = {"sound": "stamp", "feeling": "wave", "exclaim": "stamp"}


class AccentError(ValueError):
    """사전 · 문턱에 맞지 않는 입력 — 조용히 고치지 않는다."""


@dataclass(frozen=True)
class CutContext:
    cut_id: str
    start_ms: int
    end_ms: int
    # 필드 → content-vocabulary 개념 id
    concepts: dict[str, tuple[str, ...]]
    subject: Box | None = None
    # 컷 구간의 움직임 곡선(STEP_MS 간격, 컷 시작부터) · 대표 프레임 휘도 격자(위 → 아래 행) — pipeline/accent_inputs.py
    motion: tuple[float, ...] = ()
    luma: tuple[tuple[float, ...], ...] | None = None
    # 컷 영상이 화면에서 차지하는 자리(0~1) — 가로 영상이 검은 띠 사이에 놓이면 그 사이. None 이면 화면 전체(subject.frame_box)
    frame: Box | None = None


@dataclass(frozen=True)
class Override:
    """층 b(accent_id) 또는 층 c(text + category)."""

    accent_id: str | None = None
    text: str | None = None
    category: str | None = None


@dataclass(frozen=True)
class Choice:
    accent_id: str
    text: str
    category: str
    motion: str
    source: str
    reason: str


@dataclass(frozen=True)
class Accent:
    cut_id: str
    choice: Choice
    palette: str
    fill: str
    line: str
    anchor: str
    xy: tuple[float, float]
    rotation: float
    start_ms: int
    end_ms: int
    beats: tuple[int, ...] = field(default_factory=tuple)
    # 실제로 쓰는 모션(에너지가 사전 모션을 바꿀 수 있다)과 그 근거
    motion: str = ""
    energy: str = accent_fit.MID
    notes: tuple[str, ...] = ()
    # 자리에 들어가지 않아 줄인 배율(SHRINK 중 하나)
    scale: float = 1.0

    @property
    def rect(self) -> Box:
        bw, bh = text_box(self.choice.text, self.choice.category, self.scale)
        return rect_around(self.xy, bw, bh)


@dataclass
class Plan:
    accents: list[Accent] = field(default_factory=list)
    # (cut_id, 이유) — 액센트가 붙지 않은 컷
    skipped: list[tuple[str, str]] = field(default_factory=list)


def roll(stage_seed: int, *axis: str) -> int:
    return int(hashlib.sha256(":".join((str(stage_seed), *axis)).encode()).hexdigest()[:12], 16)


def unit(stage_seed: int, *axis: str) -> float:
    """[-1, 1) 균등."""
    return (roll(stage_seed, *axis) % 1_000_000) / 500_000 - 1


# ── 무엇을 ────────────────────────────────────────────────────────────
def lineage(fld: str, concept: str) -> set[str]:
    """개념과 그 상위 개념들 — 하위 개념은 상위 개념의 액센트를 물려받는다."""
    concepts = CONTENT["concepts"].get(fld, {})
    seen: set[str] = set()
    while concept in concepts and concept not in seen:
        seen.add(concept)
        concept = concepts[concept].get("parent", "")
    return seen


def match(entry: dict, cut: CutContext) -> tuple[int, list[str]]:
    score, hits = 0, []
    for fld, wanted in entry["evokedBy"].items():
        for concept in cut.concepts.get(fld, ()):
            hit = lineage(fld, concept) & set(wanted)
            if hit:
                score += VOCABULARY["fieldWeights"][fld]
                hits.append(f"{fld}:{concept}")
    return score, hits


def choose(cut: CutContext, stage_seed: int, recent: list[str], override: Override | None = None) -> Choice | None:
    if override is not None:
        chosen = _from_override(override, cut)
        if chosen is not None:
            return chosen
    scored = []
    for accent_id, entry in ACCENTS.items():
        if accent_id in recent[-VOCABULARY["cooldown"]:]:
            continue
        score, hits = match(entry, cut)
        if score:
            scored.append((score, roll(stage_seed, cut.cut_id, "text", accent_id), accent_id, hits))
    if scored:
        _, _, accent_id, hits = max(scored)
        return _choice(accent_id, DICTIONARY, " · ".join(hits))
    return _keyword(cut)


def _choice(accent_id: str, source: str, reason: str) -> Choice:
    entry = ACCENTS[accent_id]
    return Choice(accent_id, entry["text"], entry["category"], entry["motion"], source, reason)


def _from_override(override: Override, cut: CutContext) -> Choice | None:
    if override.accent_id is not None:
        if override.accent_id not in ACCENTS:
            raise AccentError(f"사전에 없는 액센트입니다: {override.accent_id}")
        return _choice(override.accent_id, AGENT, "에이전트가 고름")
    if override.text is None:
        return None
    try:
        text = validate_generated(override.text)
    except AccentError:
        return None
    category = override.category or "exclaim"
    if category not in GENERATED["categories"]:
        raise AccentError(f"생성 글의 종류가 아닙니다: {category}")
    return Choice(f"gen:{cut.cut_id}", text, category, GENERATED_MOTION[category], GENERATED_SOURCE, "생성")


def _keyword(cut: CutContext) -> Choice | None:
    places = CONTENT["concepts"]["places"]
    for concept in cut.concepts.get("places", ()):
        if concept in places:
            label = places[concept]["label"]
            return Choice(f"kw:{concept}", f"#{label}", "keyword", "slide", KEYWORD, f"places:{concept} (매칭 없음)")
    return None


def validate_generated(text: str) -> str:
    """층 c 의 문턱 — 한글 · 공백 · 허용 문장부호만, 길이 이하, 금칙어 없음."""
    value = " ".join(text.split())
    allowed = set(GENERATED["allowedPunctuation"]) | {" "}
    if not value or len(value) > GENERATED["maxChars"]:
        raise AccentError(f"생성 글의 길이가 맞지 않습니다: {text!r}")
    if any(not ("가" <= ch <= "힣") and ch not in allowed for ch in value):
        raise AccentError(f"생성 글에 쓸 수 없는 문자가 있습니다: {text!r}")
    if any(word in value.replace(" ", "") for word in GENERATED["banned"]):
        raise AccentError("생성 글에 금칙어가 있습니다")
    return value


def palette_for(cut: CutContext) -> str:
    palettes = VOCABULARY["palettes"]
    for mood in cut.concepts.get("moods", ()):
        if mood in palettes:
            return mood
    food = VOCABULARY["foodConcepts"]
    for fld, roots in food.items():
        if any(lineage(fld, c) & set(roots) for c in cut.concepts.get(fld, ())):
            return "food"
    return "default"


# ── 어디에 ────────────────────────────────────────────────────────────
def text_box(text: str, category: str, scale: float = 1.0) -> tuple[float, float]:
    """정규화 폭 · 높이 추정 — 한글 한 글자 ≈ 글꼴 크기, 문장부호 · 공백 · 영숫자는 그 절반. 회전 여유 10%."""
    style = CATEGORIES[category]
    size, pad = style["size"] * scale, style["outline"] * 2 * scale
    ems = sum(0.95 if ord(ch) > 0x2000 else 0.45 for ch in text)
    return (ems * size + pad) / W * 1.1, (size * 1.15 + pad) / H * 1.1


def anchor_points(name: str, subject: Box | None, bw: float, bh: float) -> list[tuple[float, float]]:
    """자리 이름 하나의 후보 중심점들. 피사체가 없으면 object.* 는 후보가 없다."""
    kind, ref = name.split(".")
    if kind == "object":
        return [] if subject is None else _object_points(ref, subject, bw, bh)
    x0, y0, x1, y1 = layout.SAFE  # 부를 때 읽는다 — layout.safe_area 가 바꿀 수 있다
    corners = {
        "topLeft": (x0 + bw / 2 + 0.02, y0 + bh / 2 + 0.03), "topRight": (x1 - bw / 2 - 0.02, y0 + bh / 2 + 0.03),
        "bottomLeft": (x0 + bw / 2 + 0.02, y1 - bh / 2 - 0.03), "bottomRight": (x1 - bw / 2 - 0.02, y1 - bh / 2 - 0.03),
        "upper": ((x0 + x1) / 2, y0 + bh / 2 + 0.02),
    }
    return [corners[ref]] if ref in corners else []


def _object_points(ref: str, subject: Box, bw: float, bh: float) -> list[tuple[float, float]]:
    x0, y0, x1, y1 = subject
    if ref == "above":
        return [((x0 + x1) / 2, y0 - bh / 2 - GAP)]
    if ref == "beside":
        cy = (y0 + y1) / 2 - bh
        return [(x1 + bw / 2 + GAP, cy), (x0 - bw / 2 - GAP, cy)]
    return []


# 제 크기로 어디에도 들어가지 않으면 줄여 본다 — 생성 글은 사전 글보다 길 수 있다
SHRINK = (1.0, 0.8, 0.65)


def place(choice: Choice, subject: Box | None, taken: list[Box], stage_seed: int, cut_id: str):
    """(자리 이름, 중심점, 배율) 또는 None(drop). 배율마다, 들어가는 첫 무리 안에서 시드로 고른다."""
    blocked = taken + ([subject] if subject is not None else [])
    for scale in SHRINK:
        bw, bh = text_box(choice.text, choice.category, scale)
        for group in CATEGORIES[choice.category]["placement"]:
            fits = [(name, xy) for name in group for xy in anchor_points(name, subject, bw, bh)
                    if fits_at(rect_around(xy, bw, bh), blocked)]
            if fits:
                return (*fits[roll(stage_seed, cut_id, "place") % len(fits)], scale)
    return None


# ── 조립 ──────────────────────────────────────────────────────────────
def plan(cuts: list[CutContext], beats: accent_fit.Beats, stage_seed: int,
         overrides: dict[str, Override] | None = None) -> Plan:
    result, recent = Plan(), []
    energy_of = dict(zip((c.cut_id for c in cuts), accent_fit.energies([c.motion for c in cuts])))
    for cut in cuts:
        accent = _plan_cut(cut, beats, stage_seed, recent, (overrides or {}).get(cut.cut_id), result,
                           energy_of[cut.cut_id])
        if accent is not None:
            result.accents.append(accent)
            recent.append(accent.choice.accent_id)
    return result


def _plan_cut(cut, beats, stage_seed, recent, override, result, energy) -> Accent | None:
    choice = choose(cut, stage_seed, recent, override)
    if choice is None:
        result.skipped.append((cut.cut_id, "맞는 개념 · 장소 없음"))
        return None
    # 앞 컷의 액센트가 아직 화면에 남아 있으면 그 자리도 피한다
    taken = [a.rect for a in result.accents[-1:] if a.end_ms > cut.start_ms]
    spot = place(choice, cut.subject, taken, stage_seed, cut.cut_id)
    if spot is None:
        result.skipped.append((cut.cut_id, f"'{choice.text}' 자리 없음 → drop"))
        return None
    style = CATEGORIES[choice.category]
    key = palette_for(cut)
    rect = rect_around(spot[1], *text_box(choice.text, choice.category, spot[2]))
    background = accent_fit.luma_under(rect, cut.luma) if cut.luma else None
    fill, line, swapped = accent_fit.contrast_colours(
        VOCABULARY["palettes"][key]["fill"], VOCABULARY["palettes"][key]["line"], background, style["box"])
    peak = accent_fit.peak_ms(cut.motion, cut.start_ms)
    start, end, beats = accent_fit.timing(cut.start_ms, cut.end_ms, style["holdBeats"], beats, peak)
    motion = accent_fit.motion_for(choice.motion, choice.category, energy)
    notes = tuple(note for note, on in (
        (f"에너지 {energy}: {choice.motion} → {motion}", motion != choice.motion),
        (f"움직임 정점 {peak}ms 근처 박자에 등장", peak is not None),
        (f"배경 밝기 {background:.2f} — 채움 · 외곽선을 맞바꿈" if background is not None else "", swapped),
    ) if on)
    rotation = round(unit(stage_seed, cut.cut_id, "tilt") * style["tiltDeg"], 1)
    return Accent(cut.cut_id, choice, key, fill, line, spot[0], spot[1], rotation, start, end, beats,
                  motion, energy, notes, spot[2])
