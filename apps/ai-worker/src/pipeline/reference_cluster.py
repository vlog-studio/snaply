"""레퍼런스 말뭉치 군집화 — numpy 만으로 k-means++ · silhouette(오프라인 R&D, `reference_corpus` 가 쓴다).

영상 한 편의 지문(`reference_corpus.fingerprint`)을 표준화해 묶는다. 군집 수는 k_min~k_max 중 silhouette 가 가장 큰 것.
같은 입력 · 시드면 같은 답(시드 고정 난수, 재시작 중 관성(inertia)이 가장 작은 것, 라벨은 처음 나온 순서로 0, 1, ...).
말뭉치는 수백 편 규모라 거리 행렬을 통째로 만든다. sklearn 은 쓰지 않는다(워커 의존성을 늘리지 않는다).
"""

from dataclasses import dataclass

import numpy as np

MAX_ITER = 100
RESTARTS = 4
MIN_POINTS = 4  # 이보다 적으면 묶지 않는다(군집 하나)


@dataclass(frozen=True)
class Clusters:
    labels: list[int]
    k: int
    silhouette: float | None  # 군집 하나면 None


def standardize(x: np.ndarray) -> np.ndarray:
    """열마다 평균 0 · 표준편차 1. 값이 모두 같은 열은 0 으로(나누지 않는다)."""
    std = x.std(axis=0)
    return (x - x.mean(axis=0)) / np.where(std > 1e-9, std, 1.0)


def _sq_dists(x: np.ndarray, centers: np.ndarray) -> np.ndarray:
    return ((x[:, None, :] - centers[None, :, :]) ** 2).sum(axis=-1)


def _seed_centers(x: np.ndarray, k: int, rng: np.random.Generator) -> np.ndarray:
    """k-means++ — 첫 중심은 무작위, 다음 중심은 가장 가까운 중심까지 거리 제곱에 비례해 뽑는다."""
    centers = [x[rng.integers(len(x))]]
    for _ in range(1, k):
        d2 = _sq_dists(x, np.array(centers)).min(axis=1)
        total = float(d2.sum())
        centers.append(x[rng.choice(len(x), p=d2 / total)] if total > 0 else x[rng.integers(len(x))])
    return np.array(centers)


def _lloyd(x: np.ndarray, centers: np.ndarray) -> tuple[np.ndarray, float]:
    """라벨이 더 바뀌지 않을 때까지 배정 → 중심 갱신. 빈 군집은 앞 중심을 그대로 둔다. (라벨, 관성)."""
    labels = np.full(len(x), -1)
    for _ in range(MAX_ITER):
        fresh = _sq_dists(x, centers).argmin(axis=1)
        if np.array_equal(fresh, labels):
            break
        labels = fresh
        centers = np.array([x[labels == c].mean(axis=0) if (labels == c).any() else centers[c] for c in range(len(centers))])
    return labels, float(_sq_dists(x, centers)[np.arange(len(x)), labels].sum())


def _relabel(labels: np.ndarray) -> np.ndarray:
    """처음 나온 순서로 0, 1, ... — 같은 묶음이면 같은 번호."""
    order = {old: new for new, old in enumerate(dict.fromkeys(labels.tolist()))}
    return np.array([order[v] for v in labels.tolist()])


def kmeans(x: np.ndarray, k: int, seed: int = 0) -> np.ndarray:
    """RESTARTS 번 k-means++ 로 시작해 관성이 가장 작은 라벨."""
    rng = np.random.default_rng(seed)
    best, best_inertia = np.zeros(len(x), dtype=int), np.inf
    for _ in range(RESTARTS):
        labels, inertia = _lloyd(x, _seed_centers(x, k, rng))
        if inertia < best_inertia - 1e-12:
            best, best_inertia = labels, inertia
    return _relabel(best)


def _point_silhouette(d: np.ndarray, labels: np.ndarray, i: int) -> float:
    same = labels == labels[i]
    if same.sum() <= 1:
        return 0.0  # 혼자인 군집의 점은 0(관례)
    a = float(d[i, same].sum() / (same.sum() - 1))
    b = min(float(d[i, labels == c].mean()) for c in np.unique(labels) if c != labels[i])
    return (b - a) / max(a, b) if max(a, b) > 0 else 0.0


def silhouette(x: np.ndarray, labels: np.ndarray) -> float:
    """평균 silhouette(-1~1, 클수록 군집이 또렷하다). 군집이 하나면 0."""
    if len(np.unique(labels)) < 2:
        return 0.0
    d = np.sqrt(_sq_dists(x, x))
    return float(np.mean([_point_silhouette(d, labels, i) for i in range(len(x))]))


def cluster(vectors: np.ndarray | list[list[float]], k_min: int = 2, k_max: int = 8, seed: int = 0) -> Clusters:
    """표준화 → k_min~min(k_max, n-1) 마다 k-means → silhouette 가 가장 큰 k(같으면 작은 k). 점이 MIN_POINTS 보다 적거나
    모두 같으면 군집 하나."""
    n = len(vectors)
    single = Clusters([0] * n, 1 if n else 0, None)
    if n < MIN_POINTS:
        return single
    x = standardize(np.asarray(vectors, dtype=float).reshape(n, -1))
    if not x.any():
        return single
    best = single
    for k in range(max(2, k_min), min(k_max, n - 1) + 1):
        labels = kmeans(x, k, seed)
        score = round(silhouette(x, labels), 4)
        if len(np.unique(labels)) >= 2 and (best.silhouette is None or score > best.silhouette):
            best = Clusters(labels.tolist(), int(len(np.unique(labels))), score)
    return best
