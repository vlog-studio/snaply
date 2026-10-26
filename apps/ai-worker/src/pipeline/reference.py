"""레퍼런스 분석 — 마음에 드는 숏브이로그 한 편에서 레시피 값을 읽는다(컷 길이 · 박자 맞춤 · 이음 · 원본 음성).

2026-10-22 레퍼런스 릴스 4편을 손으로 분석한 방법을 코드로 옮긴 것이다(docs/decisions/trend-recipes.md). 트렌드가 바뀌면 새 레퍼런스를
넣어 레시피를 고치거나 더한다 — 이 모듈은 값을 제안할 뿐 레시피를 쓰지 않는다.

- 컷: 이웃 프레임의 밝기 분포(히스토그램)가 크게 바뀌는 곳. 휩팬(카메라를 휙 돌림)은 화면이 흘러갈 뿐 분포가 비슷해 컷으로 세지 않는다
- 박자: 소리의 비트 그리드(`beat_grid`) — 컷이 박자에서 80ms 안이면 '박자에 맞은 컷'
- 경계 쌍(`boundaries`): 컷마다 앞 컷 끝 · 다음 컷 시작의 범용 특징(`match_cut.ShotEnd` — 피사체 · 구도 · 움직임 · 색)과 연결 점수.
  사용자 클립을 이을 때와 **같은 특징**이라, 레퍼런스의 경계 쌍이 쌓이면 묶어서(군집화) 전환 패턴을 찾고 그대로 적용할 수 있다
  (docs/decisions/trend-recipes.md §8, backlog). 원본 영상은 남기지 않고 이 특징값만 남긴다
- 파일 한 편 재기(`measure`): `scripts/analyze-reference.py`(한 편) · `scripts/reference-corpus.py`(말뭉치)가 같은 흐름을 쓴다
"""

import subprocess
import tempfile
from dataclasses import dataclass

import numpy as np

from pipeline import beat_grid, continuity, match_cut, recipe

# 컷: 밝기 분포가 이만큼 바뀌거나, 픽셀 차이가 CUT_PIX 를 넘고 앞뒤 1초 중앙값의 CUT_PIX_RATIO 배를 넘으면(휩팬 프레임 제외).
# 2026-10-26 직접 고른 레퍼런스 10편에서 ffmpeg scene(>0.25, 검은 띠 자른 뒤)에 맞췄다 — 0.35 · 분포만으로는 컷을 1/3~1/4 만 잡았다
CUT_HIST = 0.2
CUT_PIX, CUT_PIX_RATIO, CUT_PIX_WINDOW = 0.12, 3.0, 10
BAR_LUMA = 0.08  # 영상 내내 이보다 어두운 가장자리 행 · 열은 검은 띠(가로 영상을 세로 화면에 넣은 레터박스)
ON_BEAT_MS = 80
EVENT_GAP = 2  # 이만큼(프레임) 안에 붙은 프레임은 한 사건 — 휩팬 하나가 3~4프레임에 걸친다


@dataclass
class Reading:
    duration_ms: int
    cuts_ms: list[int]
    shot_median_ms: int
    shot_p20_ms: int
    shot_p80_ms: int
    covers: int
    whips: int
    bpm: float | None
    on_beat_ratio: float | None
    speech: bool | None
    suggestion: str


def active_area(frames: np.ndarray) -> np.ndarray:
    """검은 띠를 뺀 화면 — 띠가 화면의 70~80% 인 레퍼런스는 분포 변화가 띠에 묻혀 컷이 0 이었다."""
    peak = np.percentile(frames, 95, axis=0)
    rows, cols = np.where(peak.max(axis=1) > BAR_LUMA)[0], np.where(peak.max(axis=0) > BAR_LUMA)[0]
    if len(rows) < 4 or len(cols) < 4:
        return frames
    return frames[:, rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]


def _changes(frames: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """프레임마다 (밝기 분포 변화, 픽셀 차이, 앞뒤 CUT_PIX_WINDOW 프레임의 픽셀 차이 중앙값). 첫 프레임은 0."""
    hist = np.array([np.histogram(f, bins=16, range=(0, 1))[0] / f.size for f in frames])
    h = np.r_[0.0, 0.5 * np.abs(np.diff(hist, axis=0)).sum(axis=1)]
    p = np.r_[0.0, np.abs(np.diff(frames, axis=0)).mean(axis=(1, 2))]
    w = CUT_PIX_WINDOW
    return h, p, np.array([np.median(p[max(0, i - w):i + w + 1]) for i in range(len(p))])


def cuts_of(s: continuity.Series) -> list[int]:
    """컷 프레임(ms) — 밝기 분포가 크게 바뀌거나, 픽셀이 주변보다 튀게 바뀐 곳(휩팬은 화면이 흘러갈 뿐이라 빼고). 붙은 후보는 하나로."""
    if len(s.thumbs) < 2:
        return []
    h, p, med = _changes(active_area(s.thumbs))
    whip = [abs(dx) >= continuity.WHIP_SHIFT for dx in s.shift_x]
    hits = [i for i in range(1, len(p))
            if h[i] > CUT_HIST or (p[i] > CUT_PIX and p[i] > CUT_PIX_RATIO * med[i] and not whip[i])]
    return [j * continuity.STEP_MS for j in events(hits, 1)]


def events(frames: list[int], gap: int = EVENT_GAP) -> list[int]:
    """붙어 있는 프레임(사이가 gap 이하)을 한 사건으로 — 사건마다 첫 프레임. `continuity.whips` · `covers` 는 프레임을 돌려주는데
    레퍼런스에서 세고 싶은 것은 전환 횟수다(2026-10-25 쇼츠 135편: 프레임으로 세니 휩팬이 컷의 2~3배였다)."""
    return [f for k, f in enumerate(frames) if k == 0 or f - frames[k - 1] > gap]


def suggest(shot_median_ms: int, speech: bool | None, letterbox: bool = False, on_beat: float | None = None) -> str:
    """가장 가까운 포맷 — 원본 음성이 남아 있으면 하루로그, 레터박스면 시네마틱, 짧은 컷은 박자에 맞으면 비트싱크 · 아니면 빠른 컷,
    중간은 루틴, 긴 컷은 하루 타임스탬프."""
    if speech:
        return "daylog"
    if letterbox:
        return "cinematic"
    if shot_median_ms < 650:
        return "beat-sync" if (on_beat or 0) >= 0.6 else "fast-cut"
    if shot_median_ms <= 1300:
        return "trend-routine"
    return "day-stamp"


def letterbox(s: continuity.Series) -> bool:
    """세로 화면 위아래가 내내 검은가(시네마틱 레터박스) — 가운데 프레임들에서 위 · 아래 20% 행이 거의 검으면."""
    if not len(s.thumbs):
        return False
    frames = s.thumbs[len(s.thumbs) // 4: max(len(s.thumbs) // 4 + 1, 3 * len(s.thumbs) // 4)]
    rows = frames.mean(axis=(0, 2))
    edge = max(1, int(len(rows) * 0.2))
    return float(rows[:edge].mean()) < 0.06 and float(rows[-edge:].mean()) < 0.06 and float(rows[edge:-edge].mean()) > 0.15


def to_recipe(reading: "Reading", is_letterbox: bool = False) -> tuple[str, dict]:
    """레퍼런스 따라 하기(§11) — 가까운 포맷을 바탕으로 레퍼런스에서 잰 값으로 덮은 즉석 레시피(이름, 설정).

    덮는 값: 컷 길이(20~80 분위, 0.4~3초 안), 박자 맞춤(박자에 맞은 컷이 반 이상이면), 화면 틀(레터박스), 전환 효과 비율(휩팬이 컷의 몇 분의
    몇인가 — 휩은 컷 전환 효과의 whip 으로). 나머지(효과음 · 글 · 타이틀)는 바탕 포맷 그대로 — 사람이 검수해 포맷으로 올리는 출발점이다."""
    base = suggest(reading.shot_median_ms, reading.speech, is_letterbox, reading.on_beat_ratio)
    spec = {k: (dict(v) if isinstance(v, dict) else v) for k, v in recipe.get(base).spec.items()}
    lo = int(min(3000, max(400, reading.shot_p20_ms)))
    hi = int(min(3000, max(lo + 200, reading.shot_p80_ms)))
    spec["continuity"] = {**spec["continuity"], "shotMs": [lo, hi],
                          "beatSnap": bool(reading.on_beat_ratio is not None and reading.on_beat_ratio >= 0.5)}
    if is_letterbox:
        spec["frame"] = "letterbox"
    cuts = max(1, len(reading.cuts_ms))
    whip_rate = min(0.6, reading.whips / cuts)
    if whip_rate > 0.05:
        spec["transitions"] = {"rate": round(whip_rate, 2), "palette": {"whip": 1}}
    spec["label"] = f"레퍼런스 따라 하기 — {base} 바탕, 컷 {lo}~{hi}ms"
    return base, spec


def read(s: continuity.Series, beats: tuple[int, ...] | None = None, bpm: float | None = None,
         speech: bool | None = None) -> Reading:
    cuts = cuts_of(s)
    shots = np.diff([0, *cuts, s.length_ms]) if s.length_ms else np.array([0])
    on_beat = None
    if beats and cuts:
        on_beat = round(sum(1 for c in cuts if min(abs(b - c) for b in beats) <= ON_BEAT_MS) / len(cuts), 2)
    median = int(np.median(shots))
    return Reading(s.length_ms, cuts, median, int(np.percentile(shots, 20)), int(np.percentile(shots, 80)),
                   len(events(continuity.covers(s))), len(whip_events(s, cuts)), bpm, on_beat, speech,
                   suggest(median, speech, letterbox(s), on_beat))


def whip_events(s: continuity.Series, cuts_ms: list[int]) -> list[int]:
    """휩팬 사건(프레임) — 컷 바로 옆(±1프레임)은 뺀다. 컷에서는 화면이 통째로 바뀌어 움직임이 튀고 위상 이동도 엉뚱하게 나온다."""
    near_cut = {c // continuity.STEP_MS + d for c in cuts_ms for d in (-1, 0, 1)}
    return events([f for f in continuity.whips(s) if f not in near_cut])


def boundaries(path: str, cuts_ms: list[int], duration_ms: int, size: tuple[int, int] = (90, 160)) -> list[dict]:
    """컷마다 {at_ms, prev_end, next_start, link} — 앞 컷 끝 · 다음 컷 시작의 특징과 둘의 연결 점수(태그는 없어 0)."""
    edges = [0, *cuts_ms, duration_ms]
    shots = [match_cut.ends_of(path, a, b, size) for a, b in zip(edges, edges[1:]) if b - a >= 200]
    out = []
    for at, (prev, nxt) in zip(cuts_ms, zip(shots, shots[1:])):
        part = match_cut.link(prev[1], nxt[0], set(), set())
        out.append({"at_ms": at, "prev_end": prev[1].as_dict(), "next_start": nxt[0].as_dict(),
                    "link": {k: round(v, 2) for k, v in part.items()}})
    return out


@dataclass
class Measured:
    """영상 파일 한 편을 잰 것 — 읽은 값 · 레터박스 · (요청하면) 경계 쌍."""
    reading: Reading
    letterbox: bool
    boundaries: list[dict] | None


def has_speech(path: str) -> bool:
    """원본에 말소리가 남았나 — 16kHz 모노로 뽑아 whisper(VAD)로 4글자 이상 문장이 있는지. 모델을 받아 느리다."""
    from faster_whisper import WhisperModel  # noqa: PLC0415 — 요청할 때만

    with tempfile.NamedTemporaryFile(suffix=".wav") as wav:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ac", "1", "-ar", "16000", wav.name], check=True)
        segments, _ = WhisperModel("base", device="cpu", compute_type="int8").transcribe(wav.name, vad_filter=True)
        return any(len(s.text.strip()) >= 4 for s in segments)


def measure(path: str, speech: bool = False, with_boundaries: bool = False) -> Measured:
    """파일 한 편을 잰다 — 프레임 · 비트 그리드 → `read`, 레터박스, 요청하면 말소리(whisper) · 경계 쌍(`boundaries`)."""
    series = continuity.read_series(path)
    samples = beat_grid.decode(path)
    grid = beat_grid.analyze_samples(samples) if len(samples) else None
    beats = grid.beats_ms if grid and grid.beats_ms else None
    reading = read(series, beats, grid.bpm if grid else None, has_speech(path) if speech else None)
    bounds = boundaries(path, reading.cuts_ms, reading.duration_ms) if with_boundaries else None
    return Measured(reading, letterbox(series), bounds)
