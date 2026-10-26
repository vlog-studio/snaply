"""레퍼런스 말뭉치 리포트(`reference_corpus.report`)를 사람이 읽는 마크다운으로 — 커버리지 · 플랫폼별 · 라벨 일치율 · 군집 표 ·
새 포맷 후보(커버되지 않는 군집)와 그 축 · 레시피 초안. 순수 함수(파일은 스크립트가 쓴다).
"""

import json
from collections.abc import Mapping, Sequence

AXIS_NAMES = {"shot": "컷 길이", "beat": "박자 맞춤", "frame": "화면 틀", "speech": "원본 말소리", "whip": "휩팬"}


def _pct(ratio: float | None) -> str:
    return "-" if ratio is None else f"{ratio * 100:.0f}%"


def _counts(counts: Mapping[str, int]) -> str:
    return ", ".join(f"{k} {v}" for k, v in counts.items()) or "-"


def _axes(counts: Mapping[str, int]) -> str:
    return ", ".join(f"{AXIS_NAMES.get(k, k)} {v}" for k, v in counts.items()) or "-"


def _coverage(report: Mapping) -> list[str]:
    cov, agree = report["coverage"], report["labelAgreement"]
    lines = ["## 커버리지", "", f"- 원테이크로 뺀 영상(컷 3개 미만): {len(report.get('oneTake', []))}편", f"- 전체: {_pct(cov['ratio'])} ({cov['covered']}/{cov['n']}편 — 지금 레시피 하나로 표현 가능)"]
    lines += [f"- {p}: {_pct(s['ratio'])} ({s['covered']}/{s['n']})" for p, s in cov["byPlatform"].items()]
    lines += [f"- 가장 가까운 레시피로도 못 맞춘 축: {_axes({k: v for k, v in cov['axisFailures'].items() if v})}",
              f"- 사람 라벨 vs best 일치율: {_pct(agree['ratio'])} ({agree['matches']}/{agree['n']}, 빈칸 · unknown 제외)", ""]
    return lines


def _cluster_table(clusters: Sequence[Mapping]) -> list[str]:
    lines = ["| # | 크기 | 커버 | 후보 | 플랫폼 | 사람 라벨 | best 레시피 | 흔한 misfit |", "|---|---|---|---|---|---|---|---|"]
    for i, c in enumerate(clusters):
        lines.append(f"| {i} | {c['size']} | {_pct(c['coverRatio'])} | {'예' if c['candidate'] else ''} | {_counts(c['platforms'])} | "
                     f"{_counts(c['labels'])} | {_counts(c['bestRecipes'])} | {_axes(c['misfitAxes'])} |")
    return lines + [""]


def _candidates(clusters: Sequence[Mapping]) -> list[str]:
    lines = ["## 새 포맷 · 엔진 작업 후보 (커버되지 않는 군집)", ""]
    picked = [(i, c) for i, c in enumerate(clusters) if c["candidate"]]
    if not picked:
        return lines + ["없음 — 모든 군집의 절반 이상이 지금 레시피로 표현된다.", ""]
    for i, c in picked:
        lines += [f"### 군집 {i} — {c['size']}편, 못 맞춘 축: {_axes(c['misfitAxes'])}", "", f"영상: {', '.join(c['ids'])}", "",
                  f"레시피 초안(바탕 {c['draft']['base']}):", "", "```json",
                  json.dumps(c["draft"]["spec"], ensure_ascii=False, indent=1), "```", ""]
    return lines


def to_markdown(report: Mapping) -> str:
    """리포트 dict → report.md 본문."""
    clustering = report["clustering"]
    meta = (f"- 영상 {report['coverage']['n']}편 · 특징 판 {report['featureVersions']} · "
            f"레시피 사전 판 {report.get('recipeVocabularyVersion', '-')} · 만든 시각 {report.get('generatedAt', '-')}")
    head = ["# 레퍼런스 말뭉치 리포트", "", meta, ""]
    table = [f"## 군집 (k={clustering['k']}, silhouette {clustering['silhouette']})", "", *_cluster_table(report["clusters"])]
    return "\n".join([*head, *_coverage(report), *table, *_candidates(report["clusters"])])
