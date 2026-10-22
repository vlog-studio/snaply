"""매치컷 — 서로 다른 장면을 한 동작처럼 잇는다(docs/decisions/trend-recipes.md §8).

"A 음식으로 줌 인 → B 음식에서 줌 아웃": 앞 컷의 끝은 그 피사체로 다가가고 다음 컷의 시작은 그 피사체에서 물러난다. 경계에서 두 피사체가
화면의 같은 자리 · 같은 크기에 오면 다른 장면이어도 한 번의 카메라 움직임처럼 보인다. 그래서 핵심은 **피사체의 중심과 크기**다.

1. 컷 끝 · 시작마다 범용 특징(`ShotEnd`) — 피사체 중심 · 크기(얼굴이 있으면 얼굴, 없으면 눈에 띄는 영역), 카메라 움직임(줌 인 · 아웃 · 팬 ·
   정지 — 옵티컬 플로우), 색(Lab 평균), 밝기. 레퍼런스 분석(`reference.boundaries`)도 같은 특징을 남긴다 — 레퍼런스의 경계 쌍이 쌓이면
   그것을 묶어(군집화) 전환 패턴을 찾는다(backlog)
2. 두 컷 사이의 연결 점수(`link`) — 분석 태그가 겹치는가(음식 ↔ 음식), 구도(피사체 자리 · 크기)가 비슷한가, 색이 비슷한가, 움직임이 이어지는가
3. 순서(`order`) — 연결 점수 합이 가장 큰 경로(모든 시작점에서 탐욕 + 2-opt). 촬영 순서는 따르지 않는다(레시피가 그렇게 정했을 때)
4. 점수가 문턱 이상인 경계에 매치 줌(`cut_fx` 의 match) — 줌 배율은 피사체가 화면 너비의 subjectFill 만큼 차도록

**원본에 찍힌 줌을 먼저 쓴다**(레시피 match.motion). 사람들은 음식을 찍으며 줌 인 · 아웃을 되풀이한다 — 그 구간을 찾아(`zoom_runs`) 컷을
**원본의 줌 아웃이 시작되는 곳에서 시작해 줌 인이 끝나는(가장 다가간) 곳에서 끝나게** 자른다(`motion_window`). 그러면 경계마다 "A 가 다가가고 →
B 가 가까이서 물러난다"가 원본 움직임 그대로 이어진다. 디지털 매치 줌은 원본 움직임으로 이어지지 않는 경계에만 대신 쓴다.

워커 안에서만 계산한다 — 프레임을 밖으로 보내지 않는다.
"""

import subprocess
from dataclasses import dataclass, replace

import numpy as np

import random

from pipeline import content as content_mod
from pipeline import continuity
from pipeline import text_accent as ta
from pipeline import vocabulary as _vocabulary

MOTION_LINKS: dict = _vocabulary.load("motion-link-vocabulary.json")
_MOTION_SCORE = {(l["from"], l["to"]): l["score"] for l in MOTION_LINKS["links"]}

READ_W, READ_H, READ_FPS = 90, 160, 5
EDGE_S = 0.6  # 컷 끝 · 시작에서 특징을 재는 길이
WEIGHTS = {"tags": 0.4, "layout": 0.25, "color": 0.25, "motion": 0.1}
# 원본 줌으로 잇는 레시피 — 움직임이 이어지는지가 먼저
MOTION_WEIGHTS = {"tags": 0.3, "layout": 0.15, "color": 0.15, "motion": 0.4}
# 원본 줌 구간: 이웃 프레임 발산(옵티컬 플로우)이 그 영상의 상위 10% 의 이 몫(최소 ZOOM_FLOOR)을 넘는 곳이 ZOOM_MIN_STEPS 이상 이어질 때
ZOOM_SHARE, ZOOM_FLOOR, ZOOM_MIN_STEPS = 0.3, 0.3, 4
ZOOM_RANGE = (1.15, 1.8)


@dataclass(frozen=True)
class ShotEnd:
    cx: float  # 피사체 중심(화면 몫)
    cy: float
    size: float  # 피사체 크기(화면 너비 몫)
    motion: str  # zoom_in · zoom_out · pan_left · pan_right · static
    lab: tuple[float, float, float]
    luma: float

    def as_dict(self) -> dict:
        return {"cx": round(self.cx, 3), "cy": round(self.cy, 3), "size": round(self.size, 3), "motion": self.motion,
                "lab": [round(v, 1) for v in self.lab], "luma": round(self.luma, 3)}


# ── 읽기 · 특징 ───────────────────────────────────────────────────────
def read_frames(path: str, start_ms: int = 0, end_ms: int | None = None, size: tuple[int, int] = (READ_W, READ_H)) -> np.ndarray:
    """(N, h, w, 3) RGB uint8, READ_FPS. 결과물 구간과 같은 비율로 가운데를 잘라(cover) 읽는다 — 그래야 피사체 좌표가 구간의
    좌표와 같다. 회전은 ffmpeg 가 맞춘다."""
    w, h = size
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{start_ms / 1000:.3f}"]
    if end_ms is not None:
        cmd += ["-t", f"{max(0.1, (end_ms - start_ms) / 1000):.3f}"]
    cmd += ["-i", path, "-vf", f"fps={READ_FPS},scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}",
            "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)


def read_size(width: int, height: int) -> tuple[int, int]:
    """결과물 구간 비율의 작은 읽기 크기(긴 변 160, 짝수)."""
    scale = 160 / max(width, height)
    return max(2, round(width * scale / 2) * 2), max(2, round(height * scale / 2) * 2)


def _lab(rgb: np.ndarray) -> np.ndarray:
    """sRGB(0~255) → CIE Lab, D65."""
    c = rgb.astype(np.float32) / 255
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[0.4124, 0.2126, 0.0193], [0.3576, 0.7152, 0.1192], [0.1805, 0.0722, 0.9505]], np.float32)
    xyz /= np.array([0.9505, 1.0, 1.089], np.float32)
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)


def _blur(a: np.ndarray, k: int = 5) -> np.ndarray:
    kernel = np.ones(k, np.float32) / k
    a = np.apply_along_axis(lambda r: np.convolve(r, kernel, mode="same"), 0, a)
    return np.apply_along_axis(lambda r: np.convolve(r, kernel, mode="same"), 1, a)


def saliency(rgb: np.ndarray) -> np.ndarray:
    """눈에 띄는 정도(0~1) — 흐린 Lab 이 화면 평균에서 얼마나 먼가(Achanta 2009) × 가운데 가중."""
    lab = _lab(rgb)
    blurred = np.stack([_blur(lab[..., i]) for i in range(3)], axis=-1)
    s = np.linalg.norm(blurred - lab.reshape(-1, 3).mean(axis=0), axis=-1)
    h, w = s.shape
    yy, xx = np.mgrid[0:h, 0:w]
    center = np.exp(-(((xx - w / 2) / (w * 0.6)) ** 2 + ((yy - h / 2) / (h * 0.6)) ** 2))
    s = s * center
    return s / s.max() if s.max() > 0 else s


def subject(rgb: np.ndarray) -> tuple[float, float, float]:
    """(중심 x, 중심 y, 크기) — 얼굴이 있으면 가장 큰 얼굴, 없으면 눈에 띄는 영역 상위 15% 의 무게중심과 퍼짐."""
    face = _largest_face(rgb)
    if face is not None:
        return face
    s = saliency(rgb)
    mask = s >= max(float(np.quantile(s, 0.85)), 0.5)  # 상위 15% 중에서도 가장 눈에 띄는 것의 절반 이상만 — 배경이 섞이지 않게
    ys, xs = np.nonzero(mask)
    weights = s[mask]
    h, w = s.shape
    cx, cy = float(np.average(xs, weights=weights)) / w, float(np.average(ys, weights=weights)) / h
    # 퍼짐은 화면 너비 단위로(세로도) — 원판이면 지름 ≈ 2√2 × RMS 거리
    rms = float(np.sqrt(np.average((xs / w - cx) ** 2 + (ys / w - cy * h / w) ** 2, weights=weights)))
    return cx, cy, float(min(1.0, max(0.12, rms * 2 * np.sqrt(2))))


def _largest_face(rgb: np.ndarray) -> tuple[float, float, float] | None:
    try:
        from pipeline import face
        import cv2  # noqa: F401
    except ImportError:
        return None
    try:
        frame = np.ascontiguousarray(np.asarray(_resize(rgb, face.READ_W, face.READ_H))[..., ::-1])
        boxes = face.detect_frames(frame[None])[0]
    except Exception:  # noqa: BLE001 — 얼굴을 못 찾으면 눈에 띄는 영역으로
        return None
    if not boxes:
        return None
    b = max(boxes, key=lambda b: b.w * b.h)
    if b.w < 0.08:
        return None
    return b.x + b.w / 2, b.y + b.h / 2, b.w * 1.6  # 얼굴보다 조금 넓게(머리 · 어깨)


def _resize(rgb: np.ndarray, w: int, h: int):
    from PIL import Image
    return Image.fromarray(rgb).resize((w, h), Image.BILINEAR)


def motion_of(frames: np.ndarray) -> str:
    """카메라 움직임 — 옵티컬 플로우의 발산(바깥으로 퍼지면 줌 인)과 평균 가로 이동."""
    if len(frames) < 2:
        return "static"
    try:
        import cv2
    except ImportError:
        return "static"
    gray = [cv2.cvtColor(f, cv2.COLOR_RGB2GRAY) for f in frames]
    div, dx = [], []
    h, w = gray[0].shape
    yy, xx = np.mgrid[0:h, 0:w]
    rx, ry = (xx - w / 2) / w, (yy - h / 2) / h
    norm = np.sqrt(rx ** 2 + ry ** 2) + 1e-6
    for a, b in zip(gray, gray[1:]):
        flow = cv2.calcOpticalFlowFarneback(a, b, None, 0.5, 2, 9, 3, 5, 1.1, 0)
        div.append(float(np.mean((flow[..., 0] * rx + flow[..., 1] * ry) / norm)))
        dx.append(float(np.mean(flow[..., 0])))
    d, x = float(np.mean(div)), float(np.mean(dx))
    if abs(d) > 0.25 and abs(d) >= abs(x) * 0.5:
        return "zoom_in" if d > 0 else "zoom_out"
    if abs(x) > 0.6:
        return "pan_left" if x > 0 else "pan_right"  # 화면이 오른쪽으로 흐르면 카메라는 왼쪽으로
    return "static"


def shot_end(frames: np.ndarray) -> ShotEnd:
    """컷 끝(또는 시작) 몇 프레임의 특징 — 피사체는 가운데 프레임에서."""
    mid = frames[len(frames) // 2]
    cx, cy, size = subject(mid)
    lab = _lab(mid).reshape(-1, 3).mean(axis=0)
    return ShotEnd(cx, cy, size, motion_of(frames), (float(lab[0]), float(lab[1]), float(lab[2])), float(lab[0]) / 100)


def ends_of(path: str, start_ms: int, end_ms: int, size: tuple[int, int] = (READ_W, READ_H)) -> tuple[ShotEnd, ShotEnd]:
    """구간 [start, end) 의 (시작 특징, 끝 특징). size 는 결과물 구간 비율의 읽기 크기(read_size)."""
    frames = read_frames(path, start_ms, end_ms, size)
    edge = max(2, int(EDGE_S * READ_FPS))
    if len(frames) == 0:
        blank = ShotEnd(0.5, 0.5, 0.5, "static", (50.0, 0.0, 0.0), 0.5)
        return blank, blank
    return shot_end(frames[:edge]), shot_end(frames[-edge:])


# ── 연결 점수 · 순서 ─────────────────────────────────────────────────
def tags_of(analysis: dict) -> set[str]:
    """비교할 태그 — 내용 개념 id(`fld:id`)와, 개념 사전에 없더라도 버리지 않는 분석의 사물 · 장소 낱말(`w:낱말`)."""
    out: set[str] = set()
    for fld, ids in content_mod.concepts_of(analysis).items():
        out |= {f"{fld}:{i}" for i in ids}
    for fld in ("objects", "places"):
        for value in analysis.get(fld) or []:
            out |= {f"w:{word}" for word in str(value).split() if len(word) >= 2}
    return out


def concept_similarity(a: str, b: str) -> float:
    """두 개념(`fld:id`)이 개념 사전의 계층에서 얼마나 같은가 — 같으면 1, 상위 개념을 공유하면 공유한 깊이의 몫(파스타 · 케이크는
    '음식' 에서 만난다), 필드가 다르거나 만나지 않으면 0."""
    fa, ia = a.split(":", 1)
    fb, ib = b.split(":", 1)
    if fa != fb:
        return 0.0
    la, lb = ta.lineage(fa, ia), ta.lineage(fb, ib)
    if not la or not lb:
        return 1.0 if ia == ib else 0.0
    return len(la & lb) / max(len(la), len(lb))


def tag_similarity(a_tags: set[str], b_tags: set[str]) -> float:
    """개념은 계층으로(0.7), 사전 밖 낱말은 겹침으로(0.3) — 온톨로지는 정확한 분류를, 낱말은 사전이 아직 모르는 것을 맡는다."""
    ca, cb = [t for t in a_tags if not t.startswith("w:")], [t for t in b_tags if not t.startswith("w:")]
    wa, wb = {t for t in a_tags if t.startswith("w:")}, {t for t in b_tags if t.startswith("w:")}
    concept = 0.0
    if ca and cb:
        best_a = [max(concept_similarity(x, y) for y in cb) for x in ca]
        best_b = [max(concept_similarity(y, x) for x in ca) for y in cb]
        concept = (sum(best_a) / len(best_a) + sum(best_b) / len(best_b)) / 2
    words = len(wa & wb) / len(wa | wb) if wa | wb else 0.0
    return 0.7 * concept + 0.3 * words


def motion_score(a: str, b: str) -> float:
    """움직임 연결 규칙(motion-link-vocabulary.json) — 정의 안 된 조합은 default(0), 어색한 조합만 음수."""
    return float(_MOTION_SCORE.get((a, b), MOTION_LINKS["default"]))


# ── 원본 줌 구간 ─────────────────────────────────────────────────────
def zoom_track(s: continuity.Series) -> np.ndarray:
    """continuity 의 작은 회색 프레임(10fps)에서 이웃 프레임의 발산 — 양수면 줌 인(바깥으로 퍼짐), 음수면 줌 아웃. 3프레임 평균."""
    import cv2

    g = [(np.clip(t, 0, 1) * 255).astype(np.uint8) for t in s.thumbs]
    if len(g) < 2:
        return np.zeros(len(g))
    h, w = g[0].shape
    yy, xx = np.mgrid[0:h, 0:w]
    rx, ry = (xx - w / 2) / w, (yy - h / 2) / h
    radius = np.sqrt(rx ** 2 + ry ** 2) + 1e-6
    d = [0.0]
    for a, b in zip(g, g[1:]):
        flow = cv2.calcOpticalFlowFarneback(a, b, None, 0.5, 2, 7, 3, 5, 1.1, 0)
        d.append(float(np.mean((flow[..., 0] * rx + flow[..., 1] * ry) / radius)))
    return np.convolve(d, np.ones(3) / 3, mode="same")


def zoom_runs(track: np.ndarray) -> list[tuple[str, int, int]]:
    """[(zoom_in · zoom_out, 시작 ms, 끝 ms)] — 같은 방향이 ZOOM_MIN_STEPS 이상 이어진 곳."""
    if len(track) == 0:
        return []
    thr = max(ZOOM_FLOOR, ZOOM_SHARE * float(np.percentile(np.abs(track), 90)))
    labels = ["zoom_in" if v > thr else "zoom_out" if v < -thr else None for v in track]
    runs, i = [], 0
    while i < len(labels):
        j = i
        while j < len(labels) and labels[j] == labels[i]:
            j += 1
        if labels[i] and j - i >= ZOOM_MIN_STEPS:
            runs.append((labels[i], i * continuity.STEP_MS, j * continuity.STEP_MS))
        i = j
    return runs


@dataclass(frozen=True)
class Window:
    start_ms: int
    end_ms: int
    starts_out: bool  # 원본 줌 아웃의 시작에서 시작한다(가까운 데서 물러난다)
    ends_in: bool  # 원본 줌 인의 끝에서 끝난다(가장 다가간 순간)


def motion_windows(s: continuity.Series, runs: list[tuple[str, int, int]], lo: int, hi: int, limit: int = 2,
                   target: int | None = None) -> list[Window]:
    """원본의 '줌 아웃 한 번 → 바로 이어지는 줌 인 한 번' 구간들(겹치지 않게, 좋은 순으로 limit 개까지). 줌 아웃 · 인을 여러 번 담지 않는다 —
    되풀이로 보인다. 그런 쌍이 없으면 한쪽만 맞는 구간, 그것도 없으면 가장 덜 흔들리는 구간 하나."""
    length = s.length_ms
    pairs = []
    for k in range(len(runs) - 1):
        (ka, sa, ea), (kb, sb, eb) = runs[k], runs[k + 1]
        if ka == "zoom_out" and kb == "zoom_in" and sb - ea <= 400 and lo <= eb - sa <= hi:
            pairs.append(((eb - sa) + (ea - sa) + (eb - sb), Window(sa, eb, True, True)))  # 움직임이 길수록 또렷하다
    chosen: list[Window] = []
    for _, w in sorted(pairs, key=lambda p: (-p[0], p[1].start_ms)):
        if len(chosen) < limit and all(w.end_ms <= c.start_ms or w.start_ms >= c.end_ms for c in chosen):
            chosen.append(w)
    if chosen:
        return sorted(chosen, key=lambda w: w.start_ms)
    # 줌 쌍이 없을 때의 길이 — 최소 길이 몫(target)을 주면 그것, 아니면 1.5초(원본 줌이 없는 영상에서 1.5초로 고정돼 15초를 못 채웠다)
    target = min(hi, max(lo, target or 1500))
    ins = [r for r in runs if r[0] == "zoom_in" and r[2] >= lo]
    if ins:
        i = max(ins, key=lambda r: r[2] - r[1])
        return [Window(max(0, i[2] - target), i[2], False, True)]
    outs = [r for r in runs if r[0] == "zoom_out" and length - r[1] >= lo]
    if outs:
        o = max(outs, key=lambda r: r[2] - r[1])
        return [Window(o[1], min(length, o[1] + target), True, False)]
    size = min(length, target)
    start = continuity.steady_start(s, size)
    return [Window(start, start + size, False, False)]


def with_motion(end: "ShotEnd", motion: str) -> "ShotEnd":
    return replace(end, motion=motion)


def link(a_end: ShotEnd, b_start: ShotEnd, a_tags: set[str], b_tags: set[str],
         weights: dict[str, float] = WEIGHTS) -> dict[str, float]:
    """0~1 점수들(움직임은 규칙의 -1~1 — 어색한 조합만 뺀다)과 합(score)."""
    layout = 1 - min(1.0, np.hypot(a_end.cx - b_start.cx, a_end.cy - b_start.cy) / 0.7 * 0.7
                     + abs(np.log(max(a_end.size, 0.05) / max(b_start.size, 0.05))) / 2 * 0.3)
    color = 1 - min(1.0, float(np.linalg.norm(np.subtract(a_end.lab, b_start.lab))) / 60)
    parts = {"tags": tag_similarity(a_tags, b_tags), "layout": float(layout), "color": color,
             "motion": motion_score(a_end.motion, b_start.motion)}
    parts["score"] = sum(weights[k] * v for k, v in parts.items())
    return parts


def link_contrast(a_end: ShotEnd, b_start: ShotEnd, a_tags: set[str], b_tags: set[str]) -> dict[str, float]:
    """before/after — 구도(피사체 자리 · 크기)는 같고, 같은 대상(태그)인데 색 · 밝기는 달라진 쌍이 높다. 매치컷 점수를 반쯤 뒤집은 것."""
    base = link(a_end, b_start, a_tags, b_tags)
    change = 1 - base["color"]
    parts = {"tags": base["tags"], "layout": base["layout"], "color": base["color"], "motion": base["motion"], "change": change}
    parts["score"] = 0.45 * base["layout"] + 0.25 * base["tags"] + 0.3 * change
    return parts


def order(scores, temperature: float = 0.0, explore: float = 0.0, seed: int = 0, samples: int = 24) -> list[int]:
    """scores[i][j] = i 다음에 j 를 둘 때의 연결 점수. 같은 입력 · 시드면 같은 답.

    temperature · explore 가 0 이면 합이 가장 큰 경로(모든 시작점 탐욕 → 2-opt). 아니면 자유도를 연다(trend-recipes.md §9):
    다음 컷을 점수의 softmax(온도 temperature)로 뽑고, explore 몫의 걸음은 점수와 무관하게 고른다(규칙 밖 예산).
    그렇게 samples 개의 경로를 만들어 그중 합이 가장 큰 것을 쓴다 — 무비(시드)마다 다르면서 어색하지 않게."""
    n = len(scores)
    if n <= 2:
        return list(range(n))

    def total(path):
        return sum(scores[x][y] for x, y in zip(path, path[1:]))

    if temperature <= 0 and explore <= 0:
        return _best_path(scores, total)
    rng = random.Random(seed)
    best, best_total = None, -1e9
    for _ in range(samples):
        path = [rng.randrange(n)]
        left = set(range(n)) - set(path)
        while left:
            cands = sorted(left)
            if rng.random() < explore:
                nxt = rng.choice(cands)
            else:
                vals = np.array([scores[path[-1]][j] for j in cands], dtype=float)
                weights = np.exp((vals - vals.max()) / max(temperature, 1e-3))
                nxt = rng.choices(cands, weights=weights.tolist())[0]
            path.append(nxt)
            left.remove(nxt)
        t = total(path)
        if t > best_total + 1e-9:
            best, best_total = path, t
    return best


def _best_path(scores, total) -> list[int]:
    n = len(scores)
    best, best_total = None, -1e9
    for start in range(n):
        path, left = [start], set(range(n)) - {start}
        while left:
            nxt = max(sorted(left), key=lambda j: scores[path[-1]][j])
            path.append(nxt)
            left.remove(nxt)
        improved = True
        while improved:
            improved = False
            for i in range(1, n - 1):
                for j in range(i + 1, n):
                    cand = path[:i] + path[i:j + 1][::-1] + path[j + 1:]
                    if total(cand) > total(path) + 1e-9:
                        path, improved = cand, True
        t = total(path)
        if t > best_total + 1e-9:
            best, best_total = path, t
    return best


def focus_zoom(size: float, fill: float) -> float:
    """피사체가 화면 너비의 fill 만큼 차는 배율(ZOOM_RANGE 안)."""
    return float(min(ZOOM_RANGE[1], max(ZOOM_RANGE[0], fill / max(size, 0.05))))
