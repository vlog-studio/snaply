"""ASS(libass) 문서의 공용 부품 — 시각 · 이스케이프 · 색 · 스타일 줄 · 문서 조립.

말소리 자막(`pipeline/ass_caption.py`)과 텍스트 액센트(`pipeline/text_accent.py`)가 같은 부품으로 문서를 만든다.
굽는 일은 ffmpeg `ass` 필터이고, 글꼴은 이미지에 함께 넣은 `assets/fonts/` 만 쓴다 — 시스템 글꼴로 대체되면
한글 글리프가 없어 전부 빈 네모가 된다. 그래서 `fontsdir` 를 항상 넘기고, 스타일의 글꼴 이름은 그 디렉터리
파일의 패밀리 이름과 같아야 한다(테스트가 묶는다).
"""

from dataclasses import dataclass

import config

FONTS_DIR = config.WORKER_ROOT / "assets" / "fonts"

PLAY_RES_X = 1080
PLAY_RES_Y = 1920

STYLE_FIELDS = (
    "Name", "Fontname", "Fontsize", "PrimaryColour", "SecondaryColour", "OutlineColour",
    "BackColour", "Bold", "Italic", "Underline", "StrikeOut", "ScaleX", "ScaleY", "Spacing",
    "Angle", "BorderStyle", "Outline", "Shadow", "Alignment", "MarginL", "MarginR", "MarginV",
    "Encoding",
)
EVENT_FIELDS = (
    "Layer", "Start", "End", "Style", "Name", "MarginL", "MarginR", "MarginV", "Effect", "Text",
)

# BorderStyle — 1: 외곽선 + 그림자, 3: 불투명 상자(상자는 OutlineColour 로 칠해진다)
OUTLINE = 1
BOX = 3


@dataclass(frozen=True)
class Style:
    name: str
    font: str
    size: int
    primary: str = "FFFFFF"
    secondary: str = "FFFFFF"
    outline_colour: str = "111111"
    back_colour: str = "000000"
    back_alpha: int = 0x80
    bold: bool = False
    border_style: int = OUTLINE
    outline: int = 4
    shadow: int = 0
    # numpad 배치 — 2: 아래 가운데, 5: 가운데
    alignment: int = 2
    margin_l: int = 0
    margin_r: int = 0
    margin_v: int = 0

    def line(self) -> str:
        values = (
            self.name, self.font, self.size, colour(self.primary), colour(self.secondary),
            colour(self.outline_colour), colour(self.back_colour, self.back_alpha), -1 if self.bold else 0,
            0, 0, 0, 100, 100, 0, 0, self.border_style, self.outline, self.shadow, self.alignment,
            self.margin_l, self.margin_r, self.margin_v, 1,
        )
        return "Style: " + ",".join(str(value) for value in values)


def colour(rgb: str, alpha: int = 0) -> str:
    """`RRGGBB` → ASS `&HAABBGGRR` (알파 0 이 불투명)."""
    return f"&H{alpha:02X}{_bgr(rgb)}"


def override_colour(rgb: str) -> str:
    """이벤트 안의 `\\1c` · `\\3c` 값 — 끝에 `&` 가 붙는다."""
    return f"&H{_bgr(rgb)}&"


def _bgr(rgb: str) -> str:
    value = rgb.upper()
    if len(value) != 6 or any(ch not in "0123456789ABCDEF" for ch in value):
        raise ValueError(f"색은 RRGGBB 여섯 자리입니다: {rgb}")
    return value[4:6] + value[2:4] + value[0:2]


def document(styles: list[Style], events: list[str]) -> str:
    return "\n".join([
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {PLAY_RES_X}",
        f"PlayResY: {PLAY_RES_Y}",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "YCbCr Matrix: TV.709",
        "",
        "[V4+ Styles]",
        "Format: " + ", ".join(STYLE_FIELDS),
        *(style.line() for style in styles),
        "",
        "[Events]",
        "Format: " + ", ".join(EVENT_FIELDS),
        *events,
        "",
    ])


def dialogue(start_ms: int, end_ms: int, style: str, text: str, layer: int = 0) -> str:
    return f"Dialogue: {layer},{format_timestamp(start_ms)},{format_timestamp(end_ms)},{style},,0,0,0,,{text}"


def cs(ms: int) -> int:
    """센티초(ASS 시각의 해상도), 반올림."""
    return (ms + 5) // 10


def format_timestamp(ms: int) -> str:
    """ASS 시각 `H:MM:SS.cc`."""
    value = cs(ms)
    h, value = divmod(value, 360_000)
    m, value = divmod(value, 6_000)
    s, value = divmod(value, 100)
    return f"{h}:{m:02d}:{s:02d}.{value:02d}"


def escape_text(text: str) -> str:
    """인식·생성된 글이 태그로 읽히지 않게 — `{` `}` `\\` 는 libass 에 표준 이스케이프가 없어 전각으로 바꾼다."""
    replaced = text.replace("\\", "＼").replace("{", "｛").replace("}", "｝")
    return " ".join(replaced.split())


def filter_arg(ass_path: str) -> str:
    """ffmpeg `ass` 필터 인자 — 번들 글꼴 디렉터리를 항상 함께 넘긴다."""
    return f"ass=filename={_quote(ass_path)}:fontsdir={_quote(str(FONTS_DIR))}"


def _quote(value: str) -> str:
    # 작은따옴표 안에서는 `:` `,` 가 글자 그대로다. 따옴표 자체는 경로에 오지 않는다(작업 디렉터리는 워커가 만든다)
    if "'" in value:
        raise ValueError(f"ass 필터 경로에 작은따옴표를 쓸 수 없습니다: {value}")
    return f"'{value}'"
