"""단어 단위 애니메이션 자막(ASS) — whisper 단어 타임스탬프를 줄로 묶어 ASS 문서를 만든다.

**렌더 경로에 아직 연결하지 않는다.** 소프트 자막(mov_text, `pipeline/subtitle.py`)을 번인으로 바꿀지는
미결이다(docs/decisions/subtitle-rendering.md, backlog A-7). 이 모듈은 문서 문자열만 만든다 — 렌더 경로에서
굽는 일(`ass.filter_arg`)은 그 결정 뒤에 붙인다. BGM 컷편집 영상에서는 기본으로 끈다 — 그 영상의 글은 텍스트
액센트(`pipeline/text_accent.py`)가 맡는다(docs/decisions/text-accent-stickers.md).

스타일 둘:

- `karaoke` — 줄 전체가 보이고, 말하는 단어가 차례로 채워진다(`\\kf`)
- `pop` — 단어가 말하는 순간 나타나며 살짝 커졌다 돌아온다(`\\t`)

글꼴 · 색 · 줄 길이 · 여백은 잠정 상수다. editSpec v3 가 확정되면 스타일 번들이 갖는다
(docs/plans/edit-spec-v3.md §10.5). 하단 여백은 플랫폼 UI 를 피하는 세이프 에어리어 추정치이고 실측은 A-7 이다.

계획: docs/plans/trend-editing-pipeline.md §5.1
"""

from collections.abc import Iterable
from dataclasses import dataclass

from pipeline import ass

KARAOKE = "karaoke"
POP = "pop"
STYLES: tuple[str, ...] = (KARAOKE, POP)

# 줄을 나누는 기준(잠정) — 글자 수는 공백 포함, 72px 글꼴로 1080 폭에 한 줄이 들어가는 정도
MAX_LINE_CHARS = 14
MAX_LINE_MS = 2500
# 이보다 긴 쉼은 새 줄로
MAX_GAP_MS = 600
# 마지막 단어 뒤에 줄이 남아 있는 시간 — 다음 줄이 시작되면 거기서 끊는다
LINGER_MS = 300
# ASS 시각의 해상도가 센티초라 이보다 짧은 단어는 늘린다
MIN_WORD_MS = 10

POP_SCALE = 115
POP_MS = 120

# 세이프 에어리어 추정 — 하단 약 20% · 좌우는 우측 버튼 레일을 피할 만큼(backlog A-7 실측)
MARGIN_V = round(ass.PLAY_RES_Y * 0.20)
MARGIN_H = round(ass.PLAY_RES_X * 0.12)

# karaoke 는 Secondary(흰색)에서 Primary(노랑)로 채운다. 글꼴은 assets/fonts 의 패밀리 이름
STYLE = ass.Style(
    name="Caption", font="Pretendard GOV", size=72, primary="FFE500", secondary="FFFFFF",
    outline_colour="000000", bold=True, outline=5, alignment=2,
    margin_l=MARGIN_H, margin_r=MARGIN_H, margin_v=MARGIN_V,
)


class CaptionError(ValueError):
    """자막으로 만들 수 없는 단어열 — 조용히 고치지 않는다."""


@dataclass(frozen=True)
class Word:
    start_ms: int
    end_ms: int
    text: str
    # 앞 단어와 띄어 쓰는가 — 한국어 whisper 는 한 어절을 여러 조각으로 내므로 그대로 붙이면 안 된다
    space_before: bool = True


@dataclass(frozen=True)
class CaptionLine:
    words: tuple[Word, ...]
    # 줄이 화면에서 사라지는 시각 — 마지막 단어 끝 + LINGER_MS, 다음 줄 시작에서 끊긴다
    end_ms: int

    @property
    def start_ms(self) -> int:
        return self.words[0].start_ms


def words_from_segments(segments: Iterable) -> list[Word]:
    """faster-whisper 세그먼트(`word_timestamps=True`)를 단어열로. 겹침과 0 길이는 여기서 고친다."""
    words: list[Word] = []
    for seg in segments:
        for raw in seg.words or ():
            word = _normalize(raw, words[-1].end_ms if words else 0)
            if word is not None:
                words.append(word)
    return words


def _normalize(raw, prev_end_ms: int) -> Word | None:
    text = raw.word.strip()
    if not text:
        return None
    start_ms = max(round(raw.start * 1000), prev_end_ms)
    end_ms = max(round(raw.end * 1000), start_ms + MIN_WORD_MS)
    return Word(start_ms, end_ms, text, raw.word[:1].isspace())


def group_lines(words: list[Word]) -> list[CaptionLine]:
    """단어를 쉼 · 글자 수 · 줄 길이로 끊어 줄로 묶는다."""
    _validate(words)
    groups: list[list[Word]] = []
    for word in words:
        if groups and _fits(groups[-1], word):
            groups[-1].append(word)
        else:
            groups.append([word])
    next_starts = [group[0] for group in groups[1:]] + [None]
    return [_line(group, next_word) for group, next_word in zip(groups, next_starts)]


def _validate(words: list[Word]) -> None:
    prev_end = 0
    for word in words:
        if not word.text or word.start_ms < prev_end or word.end_ms <= word.start_ms:
            raise CaptionError(f"자막 단어의 시각이 맞지 않습니다: {word}")
        prev_end = word.end_ms


def _fits(group: list[Word], word: Word) -> bool:
    if word.start_ms - group[-1].end_ms > MAX_GAP_MS:
        return False
    if word.end_ms - group[0].start_ms > MAX_LINE_MS:
        return False
    return len(_join([*group, word])) <= MAX_LINE_CHARS


def _line(group: list[Word], next_word: Word | None) -> CaptionLine:
    end_ms = group[-1].end_ms + LINGER_MS
    if next_word is not None:
        end_ms = min(end_ms, next_word.start_ms)
    return CaptionLine(tuple(group), end_ms)


def _join(words: list[Word]) -> str:
    return "".join((" " if i and w.space_before else "") + w.text for i, w in enumerate(words))


def build_document(lines: list[CaptionLine], style: str = KARAOKE) -> str:
    """ASS 문서 전체. 줄이 없으면 이벤트 없는 문서다 — 자막을 붙일지는 호출하는 쪽이 정한다."""
    if style not in STYLES:
        raise CaptionError(f"알 수 없는 자막 스타일입니다: {style}")
    render = _karaoke_text if style == KARAOKE else _pop_text
    events = [ass.dialogue(line.start_ms, line.end_ms, STYLE.name, render(line)) for line in lines]
    return ass.document([STYLE], events)


def _karaoke_text(line: CaptionLine) -> str:
    """`\\k` 는 센티초 누적이라 단어마다 반올림하면 밀린다 — 절대 시각을 센티초로 바꾼 차이로 쓴다."""
    parts: list[str] = []
    cursor = ass.cs(line.start_ms)
    for i, word in enumerate(line.words):
        gap = ass.cs(word.start_ms) - cursor
        if gap > 0:
            parts.append(f"{{\\k{gap}}}")
        duration = max(ass.cs(word.end_ms) - ass.cs(word.start_ms), 1)
        parts.append(f"{{\\kf{duration}}}{_space(i, word)}{ass.escape_text(word.text)}")
        cursor = ass.cs(word.start_ms) + duration
    return "".join(parts)


def _pop_text(line: CaptionLine) -> str:
    """단어는 처음엔 투명하다가 말하는 순간 보이며 POP_SCALE% 에서 100% 로 돌아온다. `\\t` 는 줄 시작 기준 ms."""
    parts: list[str] = []
    for i, word in enumerate(line.words):
        t = word.start_ms - line.start_ms
        tags = (
            f"\\alpha&HFF&\\fscx{POP_SCALE}\\fscy{POP_SCALE}"
            f"\\t({t},{t + 1},\\alpha&H00&)\\t({t},{t + POP_MS},\\fscx100\\fscy100)"
        )
        parts.append(f"{{{tags}}}{_space(i, word)}{ass.escape_text(word.text)}")
    return "".join(parts)


def _space(index: int, word: Word) -> str:
    return " " if index and word.space_before else ""
