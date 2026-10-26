"""레퍼런스 말뭉치 — 사람이 모은 인기 숏브이로그의 특징값으로 '지금 레시피로 표현 못 하는 것'과 새 포맷 후보를 찾는다.

오프라인 R&D 전용이다 — 운영(워커 · API)은 이 모듈을 쓰지 않는다. 사람이 릴스 · 틱톡 · 쇼츠를 저장(앱 저장 · 화면 녹화)해
시트에 한 줄씩 적고, `scripts/reference-corpus.py analyze` 가 영상마다 특징 문서({reading, letterbox, boundaries, ...})를 남긴 뒤
원본을 지운다. 이 모듈은 그 문서 · 시트 행 · 레시피 사전만 받는 순수 로직이다(IO 없음 — 같은 입력이면 같은 결과).

- 커버리지(`coverage`): 영상마다 레시피별 표현 못 하는 축(`misfits`)을 재서 가장 가까운 레시피(best)와 커버 여부
- 군집(`cluster`): 영상의 지문(`fingerprint`)을 묶는다. 커버되지 않는 군집이 새 포맷 · 엔진 작업 후보다
- 리포트(`report`): 위 둘 + 사람 라벨 일치율 + 군집마다 중앙값으로 만든 레시피 초안(`reference.to_recipe`) — 사람이 검토해
  `recipe-vocabulary.json` 에 등록한다. 결정: docs/decisions/trend-recipes.md §8 · §11
"""

import math
from collections import Counter
from collections.abc import Mapping, Sequence

import numpy as np

from pipeline import recipe, reference
from pipeline.reference_cluster import Clusters, cluster
from pipeline.reference_rows import (  # noqa: F401 — 말뭉치의 공개 이름
    CAPTURES, PLATFORMS, SHEET_COLUMNS, UNKNOWN_LABEL, Row, parse_row,
)

CORPUS_FEATURE_VERSION = 2  # 2: 컷 검출(검은 띠 제외 · 픽셀 차이) · 휩팬 · 가림을 사건으로, 컷 옆 휩팬 제외(2026-10-26). 특징 문서의 모양 · 재는 방법이 바뀌면 올린다(섞이면 리포트가 알린다)

MIN_CUTS = 3  # 이보다 컷이 적으면 원테이크 — 클립을 잇는 편집 포맷의 대상이 아니다(쇼츠 135편 중 100편이 컷 0)
AXES = ("shot", "beat", "frame", "speech", "whip")
SHOT_SLACK = 0.15  # 컷 길이 중앙값이 레시피 범위를 이만큼(몫) 넘어야 못 맞춘다
BEAT_SNAP_MIN = 0.5  # beatSnap 레시피인데 박자에 맞은 컷이 이보다 적으면
BEAT_FREE_MAX = 0.8  # beatSnap 이 아닌데 박자에 맞은 컷이 이 이상이면
WHIP_MIN = 0.05  # 휩팬이 컷의 이 몫을 넘어야 휩을 따진다(reference.to_recipe 와 같은 문턱)
WHIP_SLACK = 0.1  # 휩 비율이 전환 효과 rate 를 이만큼 넘으면

PAIR_KINDS = ("pair_zoom", "pair_pan_same", "pair_static", "pair_other")
FINGERPRINT_KEYS = (
    "log_shot_median", "log_shot_p20", "log_shot_p80", "cuts_per_s", "on_beat_ratio", "has_beat", "whip_ratio",
    "cover_ratio", "speech", "letterbox", *PAIR_KINDS, "link_layout", "link_color",
)


# ── 지문 ─────────────────────────────────────────────────────────────
def _ratio(n: float, d: float) -> float:
    return n / d if d else 0.0


def _log_s(ms: float) -> float:
    """컷 길이(ms)의 로그(초) — 0.3초 · 3초 차이를 같은 무게로 본다. 50ms 아래는 50ms 로."""
    return math.log(max(ms, 50) / 1000)


def whip_rate(reading: Mapping) -> float:
    """휩팬이 컷의 몇 몫인가 — `reference.to_recipe` 와 같은 식(컷이 없으면 1 로 나눈다)."""
    return reading["whips"] / max(1, len(reading["cuts_ms"]))


def _pair_kind(boundary: Mapping) -> str:
    """경계의 움직임 쌍 — 줌 인 → 줌 아웃, 같은 방향 팬, 정지 → 정지, 그 밖(match_cut 의 운동 연결 규칙과 같은 갈래)."""
    a, b = boundary["prev_end"]["motion"], boundary["next_start"]["motion"]
    if (a, b) == ("zoom_in", "zoom_out"):
        return "pair_zoom"
    if a == b and a.startswith("pan_"):
        return "pair_pan_same"
    return "pair_static" if a == b == "static" else "pair_other"


def _boundary_features(bounds: Sequence[Mapping]) -> dict[str, float]:
    """경계 움직임 쌍의 비율과 link 의 구도 · 색 평균. 경계가 없으면 모두 0."""
    kinds = [_pair_kind(b) for b in bounds]
    out = {k: _ratio(kinds.count(k), len(kinds)) for k in PAIR_KINDS}
    for part in ("layout", "color"):
        out[f"link_{part}"] = float(np.mean([b["link"][part] for b in bounds])) if bounds else 0.0
    return out


def fingerprint(doc: Mapping) -> dict[str, float]:
    """영상 한 편의 군집화용 벡터(FINGERPRINT_KEYS). 박자를 못 쟀으면 on_beat_ratio 0 + has_beat 0."""
    r = doc["reading"]
    beat = r.get("on_beat_ratio")
    cuts = len(r["cuts_ms"])
    return {
        "log_shot_median": _log_s(r["shot_median_ms"]), "log_shot_p20": _log_s(r["shot_p20_ms"]),
        "log_shot_p80": _log_s(r["shot_p80_ms"]), "cuts_per_s": _ratio(cuts, r["duration_ms"] / 1000),
        "on_beat_ratio": float(beat or 0.0), "has_beat": float(beat is not None),
        "whip_ratio": whip_rate(r), "cover_ratio": _ratio(r["covers"], cuts),
        "speech": float(bool(r.get("speech"))), "letterbox": float(bool(doc.get("letterbox"))),
        **_boundary_features(doc.get("boundaries") or []),
    }


# ── 표현 못 하는 축 ───────────────────────────────────────────────────
def _shot_misfit(r: Mapping, spec: Mapping) -> bool:
    lo, hi = spec["continuity"]["shotMs"]
    return not lo * (1 - SHOT_SLACK) <= r["shot_median_ms"] <= hi * (1 + SHOT_SLACK)


def _beat_misfit(r: Mapping, spec: Mapping) -> bool:
    on_beat = r.get("on_beat_ratio")
    if on_beat is None:
        return False  # 박자를 못 쟀으면 판정하지 않는다
    snap = bool(spec["continuity"].get("beatSnap"))
    return on_beat < BEAT_SNAP_MIN if snap else on_beat >= BEAT_FREE_MAX


def _whip_misfit(r: Mapping, spec: Mapping) -> bool:
    rate = whip_rate(r)
    if rate <= WHIP_MIN:
        return False
    transitions = spec.get("transitions") or {}
    return "whip" not in (transitions.get("palette") or {}) or rate > transitions.get("rate", 0.0) + WHIP_SLACK


def misfits(doc: Mapping, spec: Mapping) -> list[str]:
    """그 레시피로 표현 못 하는 축(AXES 순서). 빈 목록이면 표현할 수 있다. 측정한 축만 판정한다(말소리 · 박자를 못 쟀으면 넘어간다)."""
    r = doc["reading"]
    failed = {
        "shot": _shot_misfit(r, spec),
        "beat": _beat_misfit(r, spec),
        "frame": bool(doc.get("letterbox")) != (spec.get("frame") == "letterbox"),
        "speech": r.get("speech") is True and spec["audio"]["sourceGain"] == 0,
        "whip": _whip_misfit(r, spec),
    }
    return [axis for axis in AXES if failed[axis]]


# ── 커버리지 ──────────────────────────────────────────────────────────
def _center_gap(doc: Mapping, spec: Mapping) -> float:
    lo, hi = spec["continuity"]["shotMs"]
    return abs(doc["reading"]["shot_median_ms"] - (lo + hi) / 2)


def best_fit(doc: Mapping, recipes: Mapping[str, Mapping]) -> tuple[str, list[str]]:
    """classic 을 뺀 레시피 중 misfit 이 가장 적은 것(같으면 컷 길이 범위 중심에 가까운 것, 그다음 이름 순)과 그 misfit."""
    fits = {name: misfits(doc, spec) for name, spec in recipes.items() if name != recipe.CLASSIC}
    name = min(fits, key=lambda n: (len(fits[n]), _center_gap(doc, recipes[n]), n))
    return name, fits[name]


def _share(videos: Sequence[Mapping]) -> dict:
    covered = sum(1 for v in videos if v["covered"])
    return {"n": len(videos), "covered": covered, "ratio": round(_ratio(covered, len(videos)), 3)}


def coverage(docs: Sequence[Mapping], recipes: Mapping[str, Mapping]) -> dict:
    """영상마다 {id, platform, best, misfits, covered} + 전체 · 플랫폼별 커버 비율 + 축별 실패 빈도(best 의 misfit 기준)."""
    videos = []
    for doc in docs:
        best, missing = best_fit(doc, recipes)
        videos.append({"id": doc["id"], "platform": doc["platform"], "best": best, "misfits": missing,
                       "covered": not missing})
    platforms = sorted({v["platform"] for v in videos})
    axis_counts = Counter(axis for v in videos for axis in v["misfits"])
    return {**_share(videos), "byPlatform": {p: _share([v for v in videos if v["platform"] == p]) for p in platforms},
            "axisFailures": {axis: axis_counts[axis] for axis in AXES}, "videos": videos}


# ── 군집 요약 · 리포트 ─────────────────────────────────────────────────
def _median_or_none(values: Sequence[float | None]) -> float | None:
    known = [v for v in values if v is not None]
    return float(np.median(known)) if known else None


def _majority(values: Sequence[bool | None]) -> bool | None:
    known = [bool(v) for v in values if v is not None]
    return sum(known) * 2 > len(known) if known else None


def median_reading(readings: Sequence[Mapping]) -> reference.Reading:
    """군집의 대표 Reading — 값마다 중앙값(말소리는 다수결). 컷 위치는 중앙값 컷 수를 고르게 깔아 휩 비율이 중앙값이 되게 한다."""
    def med(key: str) -> int:
        return int(np.median([r[key] for r in readings]))

    duration, cuts = med("duration_ms"), round(float(np.median([len(r["cuts_ms"]) for r in readings])))
    whips = round(float(np.median([whip_rate(r) for r in readings])) * max(1, cuts))
    on_beat, speech = _median_or_none([r.get("on_beat_ratio") for r in readings]), _majority([r.get("speech") for r in readings])
    return reference.Reading(duration, [round(duration * (i + 1) / (cuts + 1)) for i in range(cuts)], med("shot_median_ms"),
                             med("shot_p20_ms"), med("shot_p80_ms"), med("covers"), whips,
                             _median_or_none([r.get("bpm") for r in readings]), on_beat, speech,
                             reference.suggest(med("shot_median_ms"), speech, False, on_beat))


def _draft(members: Sequence[Mapping]) -> dict:
    """중앙값 Reading 으로 `reference.to_recipe` — 레터박스는 다수결."""
    base, spec = reference.to_recipe(median_reading([d["reading"] for d in members]),
                                     bool(_majority([d.get("letterbox") for d in members])))
    return {"base": base, "spec": spec}


def _summary(members: Sequence[Mapping], videos: Sequence[Mapping], labels: Mapping[str, str | None]) -> dict:
    """군집 하나 — 크기 · 플랫폼 · 사람 라벨 분포 · 커버 비율 · 흔한 misfit 축 · 레시피 초안. 커버가 절반 미만이면 새 포맷 후보."""
    share = _share(videos)
    return {"size": len(members), "ids": [d["id"] for d in members],
            "platforms": dict(Counter(d["platform"] for d in members).most_common()),
            "labels": dict(Counter(labels.get(d["id"]) or "(없음)" for d in members).most_common()),
            "coverRatio": share["ratio"], "candidate": share["ratio"] < 0.5,
            "misfitAxes": dict(Counter(a for v in videos for a in v["misfits"]).most_common()),
            "bestRecipes": dict(Counter(v["best"] for v in videos).most_common()), "draft": _draft(members)}


def label_agreement(videos: Sequence[Mapping], labels: Mapping[str, str | None]) -> dict:
    """사람 라벨(format_label — 빈칸 · unknown 제외)과 best 가 같은 몫."""
    pairs = [(labels[v["id"]], v["best"]) for v in videos if labels.get(v["id"]) not in (None, UNKNOWN_LABEL)]
    matches = sum(1 for label, best in pairs if label == best)
    return {"n": len(pairs), "matches": matches, "ratio": round(_ratio(matches, len(pairs)), 3) if pairs else None}


def group(docs: Sequence[Mapping], k: int | None = None) -> Clusters:
    """지문으로 군집 — k 를 주면 그 수로(점이 모자라면 하나), 아니면 silhouette 로 고른다."""
    vectors = [[fingerprint(d)[key] for key in FINGERPRINT_KEYS] for d in docs]
    return cluster(vectors, k, k) if k else cluster(vectors)


def edited(doc: Mapping) -> bool:
    return len(doc["reading"]["cuts_ms"]) >= MIN_CUTS


def report(all_docs: Sequence[Mapping], rows: Sequence[Row], recipes: Mapping[str, Mapping], k: int | None = None) -> dict:
    """커버리지 · 라벨 일치율 · 군집(크기가 큰 순) — 원테이크는 빼고 oneTake 에 id 만. 특징 문서 판이 섞였으면 featureVersions 에 여럿."""
    labels = {row.id: row.format_label for row in rows}
    docs = [d for d in all_docs if edited(d)]
    cov = coverage(docs, recipes)
    found = group(docs, k)
    clusters = [_summary([docs[i] for i in idx], [cov["videos"][i] for i in idx], labels)
                for idx in ([i for i, lab in enumerate(found.labels) if lab == c] for c in range(found.k))]
    return {"featureVersions": sorted({d.get("featureVersion") for d in all_docs} - {None}),
            "oneTake": [d["id"] for d in all_docs if not edited(d)],
            "coverage": cov, "labelAgreement": label_agreement(cov["videos"], labels),
            "clustering": {"k": found.k, "silhouette": found.silhouette},
            "clusters": sorted(clusters, key=lambda c: -c["size"])}
