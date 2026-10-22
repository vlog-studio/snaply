"""텍스트 액센트 → ASS 문서. 종류마다 스타일 하나, 액센트마다 이벤트 하나.

모양(글꼴 · 크기 · 외곽선 · 상자)은 사전의 `categories`, 색은 액센트가 고른 팔레트, 움직임은 `motions` 이름이다.
모션은 전부 ASS 오버라이드 태그(`\\t` · `\\move` · `\\fad`)라 렌더 의존성이 늘지 않는다. `\\t` 시각은 이벤트 시작 기준 ms.
"""

from pipeline import ass
from pipeline.text_accent import CATEGORIES, Accent

OUT_MS = 90
BUMP_MS = (60, 180)
SLIDE_PX = 220


def styles() -> list[ass.Style]:
    return [
        ass.Style(
            name=name, font=spec["font"], size=spec["size"], outline=spec["outline"], shadow=spec["shadow"],
            border_style=ass.BOX if spec["box"] else ass.OUTLINE, bold=name == "keyword",
            back_alpha=0x64, alignment=5,
        )
        for name, spec in CATEGORIES.items()
    ]


def build_document(accents: list[Accent], extra_styles: list[ass.Style] | None = None,
                   extra_events: list[str] | None = None) -> str:
    """액센트 문서. 고정 타이틀(`title_card`)처럼 같은 문서에 함께 구울 스타일 · 이벤트를 더할 수 있다."""
    return ass.document(styles() + (extra_styles or []), (extra_events or []) + [event(a) for a in accents])


def event(accent: Accent) -> str:
    text = f"{{{_position(accent)}{_colours(accent)}{motion_tags(accent)}}}{ass.escape_text(accent.choice.text)}"
    return ass.dialogue(accent.start_ms, accent.end_ms, accent.choice.category, text)


def _position(accent: Accent) -> str:
    x, y = round(accent.xy[0] * ass.PLAY_RES_X), round(accent.xy[1] * ass.PLAY_RES_Y)
    pos = f"\\move({x - SLIDE_PX},{y},{x},{y},0,140)" if accent.motion == "slide" else f"\\pos({x},{y})"
    size = "" if accent.scale == 1.0 else f"\\fs{round(CATEGORIES[accent.choice.category]['size'] * accent.scale)}"
    return f"\\an5{pos}\\frz{accent.rotation}{size}"


def _colours(accent: Accent) -> str:
    # 라벨 상자(BorderStyle 3)는 OutlineColour 로 칠해진다 — 상자 = 채움색, 글자 = 외곽선색
    if CATEGORIES[accent.choice.category]["box"]:
        return f"\\1c{ass.override_colour(accent.line)}\\3c{ass.override_colour(accent.fill)}"
    return f"\\1c{ass.override_colour(accent.fill)}\\3c{ass.override_colour(accent.line)}"


def motion_tags(accent: Accent) -> str:
    duration = accent.end_ms - accent.start_ms
    out = f"\\t({duration - OUT_MS},{duration},\\alpha&HFF&\\fscx70\\fscy70)"
    return MOTION_BUILDERS[accent.motion](accent, duration) + out


def _bumps(accent: Accent) -> str:
    up, down = BUMP_MS
    return "".join(f"\\t({b},{b + up},\\fscx108\\fscy108)\\t({b + up},{b + down},\\fscx100\\fscy100)"
                   for b in accent.beats[1:])


def _stamp(accent: Accent, _d: int) -> str:
    return "\\fscx190\\fscy190\\alpha&H60&\\t(0,90,\\fscx92\\fscy92\\alpha&H00&)\\t(90,170,\\fscx100\\fscy100)" + _bumps(accent)


def _shake(accent: Accent, _d: int) -> str:
    r = accent.rotation
    swings = "".join(f"\\t({i * 40},{i * 40 + 40},\\frz{round(r + s, 1)})" for i, s in enumerate((9, -9, 6, -6, 3, 0)))
    return f"\\fscx160\\fscy160\\t(0,80,\\fscx100\\fscy100){swings}" + _bumps(accent)


def _pop(accent: Accent, _d: int) -> str:
    return "\\fscx0\\fscy0\\t(0,130,\\fscx118\\fscy118)\\t(130,220,\\fscx100\\fscy100)" + _bumps(accent)


def _pulse(accent: Accent, _d: int) -> str:
    beats = "".join(f"\\t({b},{b + 90},\\fscx114\\fscy114)\\t({b + 90},{b + 260},\\fscx100\\fscy100)"
                    for b in accent.beats)
    return "\\fad(120,0)" + beats


def _wave(accent: Accent, duration: int) -> str:
    r = accent.rotation
    sway = "".join(f"\\t({i * 250},{i * 250 + 250},\\frz{round(r + (4 if i % 2 == 0 else -4), 1)})"
                   for i in range(duration // 250))
    return "\\fad(140,0)" + sway


def _slide(accent: Accent, _d: int) -> str:
    return "\\fad(80,0)" + _bumps(accent)


MOTION_BUILDERS = {
    "stamp": _stamp, "shake": _shake, "pop": _pop, "pulse": _pulse, "wave": _wave, "slide": _slide,
}
