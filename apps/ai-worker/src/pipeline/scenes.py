"""장면 단위 순서 · 훅(trend-recipes §22, 편집 품질 로드맵 4).

레시피의 순서는 이웃 두 컷의 연결 점수만 보고 정해 장소가 핑퐁했다(수영장 → 실내 → 수영장 …). 그래서
- **장면**: 촬영 시각 순으로 놓고 이웃 스냅이 SCENE_GAP_MIN 넘게 떨어지면 새 장면(시각을 모르면 앞 스냅의 장면)
- **순서**: 장면끼리는 촬영 순서, 연결 점수로 고르는 순서(`match_cut.order` · 빔 서치)는 한 장면 안에서만
- **훅**: 흔들리지 않는 스냅 중 움직임이 가장 큰 스냅을 맨 앞에 한 번 — 자기 장면에서는 빠진다(같은 스냅은 한 번만)
"""

from datetime import datetime

import numpy as np

from pipeline import match_cut, steadiness

SCENE_GAP_MIN = 10
HOOK_MOTION_PCT = 90  # 스냅의 움직임은 프레임 차이의 상위 10% — 한순간의 큰 동작을 본다


def group(times: list[datetime | None], gap_min: int = SCENE_GAP_MIN) -> list[int]:
    """스냅마다 장면 번호(0 부터). times 는 촬영 시각 순(워커 · 스튜디오가 그렇게 넘긴다)."""
    out, scene, last = [], 0, None
    for t in times:
        if t is not None and last is not None and (t - last).total_seconds() > gap_min * 60:
            scene += 1
        if t is not None:
            last = t
        out.append(scene)
    return out


def hook(motion: list[np.ndarray], shake: list[float]) -> int | None:
    """맨 앞에 둘 스냅 — 가장 안정된 구간의 흔들림이 SHAKY_PX 이하인 스냅 중 움직임이 가장 큰 것. 다 흔들리면 None(촬영 순서 그대로)."""
    steady = [i for i, s in enumerate(shake) if s <= steadiness.SHAKY_PX and len(motion[i])]
    if not steady:
        return None
    return max(steady, key=lambda i: (float(np.percentile(motion[i], HOOK_MOTION_PCT)), -i))


def ordered(scores: list[list[float]], scene_of: list[int], hook: int | None, temperature: float = 0.0, explore: float = 0.0,
            seed: int = 0) -> list[int]:
    """훅 → 장면 0 → 장면 1 … 장면 안은 연결 점수로 고른 순서(`match_cut.order`)."""
    out = [hook] if hook is not None else []
    for scene in sorted(set(scene_of)):
        members = [i for i, s in enumerate(scene_of) if s == scene and i != hook]
        if not members:
            continue
        sub = [[scores[a][b] for b in members] for a in members]
        out += [members[p] for p in match_cut.order(sub, temperature, explore, seed)]
    return out


def beam_allowed(scene_of: list[int], hook: int | None):
    """빔 서치의 allowed(스냅 i, 스냅 j) — 같은 장면이나 바로 다음 장면으로만(앞 장면으로 돌아가거나 건너뛰지 않는다). 훅은 첫 장면 앞이다."""
    key = [-1 if i == hook else s for i, s in enumerate(scene_of)]

    def ok(i: int, j: int) -> bool:
        return j != hook and key[i] <= key[j] <= key[i] + 1

    return ok
