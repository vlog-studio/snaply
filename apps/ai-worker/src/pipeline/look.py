"""색 필터(룩) — 무비 전체에 같은 색감을 입힌다(트렌드 레시피의 `look`, docs/decisions/trend-recipes.md §7).

스타일 프리셋(MOV-6)의 보정 위에 얹는 마지막 색이다. 컷마다 다르게 하지 않는다 — 한 편이 한 필름으로 찍힌 것처럼 보이게.
`auto` 는 컷들의 분석 문자열에서 장면을 보고 고른다(물가 → cool, 먹기 · 카페 → warm, 밤 → film, 나머지 → vivid).
"""

from collections import Counter

LOOKS: dict[str, str] = {
    # 빛바랜 필름 — 살짝 바랜 곡선 + 입자 + 비네팅
    "film": "curves=preset=vintage,eq=saturation=0.92:contrast=1.04,noise=alls=7:allf=t,vignette=angle=PI/5",
    # 따뜻한 오후
    "warm": "colortemperature=temperature=5200:mix=0.7,eq=saturation=1.12:contrast=1.04",
    # 맑은 물빛
    "cool": "colortemperature=temperature=7800:mix=0.6,eq=saturation=1.08:contrast=1.03",
    # 쨍한 색
    "vivid": "eq=saturation=1.28:contrast=1.06",
    # 자연스러운 색 — 살짝 또렷하게만(레퍼런스 ⑤ 처럼 필터 티가 나지 않게)
    "soft": "eq=saturation=1.06:contrast=1.04:gamma=1.02",
    # 흑백
    "mono": "hue=s=0,eq=contrast=1.12",
    # 레트로 — 들뜬 검정 + 누런 기운 + 입자
    "retro": "curves=r='0/0.08 1/0.96':g='0/0.05 1/0.94':b='0/0.12 1/0.82',noise=alls=10:allf=t,vignette=angle=PI/4",
}
AUTO = "auto"
SCENES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("cool", ("수영", "바다", "해변", "물놀이", "수족관", "아쿠아", "계곡", "호수")),
    ("warm", ("카페", "커피", "식사", "음식", "빵", "디저트", "요리", "노을")),
    ("film", ("밤", "야경", "어두운", "조명")),
)
DEFAULT_AUTO = "vivid"


class LookError(ValueError):
    """알 수 없는 룩."""


def _text(analysis: dict) -> str:
    parts = [analysis.get("summary") or ""]
    for fld in ("topics", "places", "objects", "actions"):
        parts += list(analysis.get(fld) or [])
    return " ".join(parts)


def choose(name: str | None, analyses: list[dict]) -> str | None:
    """레시피의 look 값 → 실제 룩 이름(없으면 None)."""
    if name is None:
        return None
    if name != AUTO:
        if name not in LOOKS:
            raise LookError(f"알 수 없는 룩: {name}")
        return name
    votes: Counter[str] = Counter()
    for analysis in analyses:
        text = _text(analysis)
        for look, words in SCENES:
            if any(w in text for w in words):
                votes[look] += 1
                break
    if not votes:
        return DEFAULT_AUTO
    best, count = votes.most_common(1)[0]
    # 한두 컷만 그런 장면이면 무비 전체 색을 바꾸지 않는다
    return best if count * 3 >= len(analyses) else DEFAULT_AUTO


def filter_of(name: str | None) -> str | None:
    if name is None:
        return None
    if name not in LOOKS:
        raise LookError(f"알 수 없는 룩: {name}")
    return LOOKS[name]
