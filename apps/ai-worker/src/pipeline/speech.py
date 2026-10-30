"""말하는 컷은 말소리를 살리고 음원을 낮춘다(trend-recipes §24, 편집 품질 로드맵 6).

레시피는 원본 소리를 빼고 음원만 쓴다(§14). 그래서 셀피로 말하는 컷도 목소리가 지워졌다. 발화 구간은 `snap_signals` 의 Silero VAD 로 재고(모델 호출 없음),
- `windows`: 컷마다 원본 구간 안의 발화를 결과물 시간으로 — 배속 · 멈춤 컷은 소리가 변조돼 뺀다
- `gain_expr`: 그 구간에서 inside, 밖에서 outside 인 ffmpeg 음량 식(`volume=...:eval=frame`) — 경계는 RAMP_S 에 걸쳐 바꾼다
"""

from functools import reduce

from pipeline import continuity

MIN_SPEECH_MS = 300  # 이보다 짧은 발화(컷 끝에 걸친 한 음절)는 살리지 않는다 — 툭 튀어나온다
SPEECH_GAIN, DUCK, RAMP_S = 1.0, 0.3, 0.15  # 말하는 동안 원본 크기 · 음원 배율 · 바뀌는 데 걸리는 시간(초)


def windows(planned: list[continuity.PlannedCut], spans: list[tuple[tuple[int, int], ...]]) -> list[tuple[int, int]]:
    """결과물 시간(ms)의 발화 구간 — spans[k] 는 컷 k 의 스냅에서 잰 발화 구간(원본 시각). 맞닿거나 겹치면 합친다."""
    out, t = [], 0
    for cut, found in zip(planned, spans):
        if cut.speed == 1.0 and not cut.ramp and not cut.hold_ms:
            for a, b in found:
                lo, hi = max(a, cut.start_ms), min(b, cut.end_ms)
                if hi - lo >= MIN_SPEECH_MS:
                    out.append((t + lo - cut.start_ms, t + hi - cut.start_ms))
        t += cut.out_ms
    merged: list[tuple[int, int]] = []
    for a, b in sorted(out):
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(b, merged[-1][1]))
        else:
            merged.append((a, b))
    return merged


def gain_expr(windows_s: list[tuple[float, float]], inside: float, outside: float, ramp: float = RAMP_S) -> str:
    """시각 t(초)의 음량 — windows_s 안에서 inside, 밖에서 outside."""
    if not windows_s:
        return f"{outside:g}"
    terms = [f"clip((t-{a:.3f})/{ramp:.3f},0,1)*clip(({b:.3f}-t)/{ramp:.3f},0,1)" for a, b in windows_s]
    shape = reduce(lambda x, y: f"max({x},{y})", terms)
    return f"{outside:g}+({inside:g}-{outside:g})*{shape}"
