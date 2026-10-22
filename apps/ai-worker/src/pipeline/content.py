"""스냅 분석의 자유 문자열 → 내용 개념 id — content-vocabulary.json 의 정규화 규칙(`_normalizeNote`).

TS 구현(`packages/shared-types/src/content-vocabulary.ts` 의 `normalizeContentValue`)과 같은 답을 내야 한다 — 추천은 API 가,
텍스트 액센트는 워커가 같은 분석을 개념으로 바꾼다. 두 구현은 공유 사례
`packages/shared-types/fixtures/content-normalization.json` 으로 묶는다(`tests/test_content.py` · `apps/api/test/content-vocabulary.test.ts`).

규칙: 값 전체가 별칭이면 그 개념 → 끝 낱말로 끝나는 구(긴 것부터) → 나머지 낱말을 오른쪽부터(조사 하나를 떼어 볼 수 있다,
머리 낱말에서는 떼지 않는다). 부분 문자열은 보지 않는다. 별칭에는 label 도 든다.
"""

from pipeline import vocabulary as _vocabulary

VOCABULARY: dict = _vocabulary.load("content-vocabulary.json")
FIELDS: tuple[str, ...] = tuple(VOCABULARY["fields"])
PARTICLES: tuple[str, ...] = tuple(VOCABULARY["normalize"]["particles"])

_ALIASES: dict[str, dict[str, str]] = {}
for _field in FIELDS:
    _by_alias: dict[str, str] = {}
    for _id, _concept in VOCABULARY["concepts"][_field].items():
        for _alias in (_concept["label"], *_concept.get("aliases", ())):
            _by_alias[_alias] = _id
    _ALIASES[_field] = _by_alias


def _alias(field: str, text: str) -> str | None:
    return _ALIASES.get(field, {}).get(text)


def _without_particle(field: str, word: str) -> str | None:
    for particle in PARTICLES:
        if len(word) > len(particle) and word.endswith(particle):
            found = _alias(field, word[: -len(particle)])
            if found:
                return found
    return None


def normalize_value(field: str, value: str) -> str | None:
    words = value.split()
    if not words:
        return None
    for start in range(len(words)):
        found = _alias(field, " ".join(words[start:]))
        if found:
            return found
    for index in range(len(words) - 2, -1, -1):
        found = _alias(field, words[index]) or _without_particle(field, words[index])
        if found:
            return found
    return None


def normalize_values(field: str, values: list[str] | tuple[str, ...]) -> list[str]:
    """사전 밖은 빠지고, 같은 개념은 처음 나온 순서로 한 번만."""
    concepts: list[str] = []
    for value in values:
        concept = normalize_value(field, value)
        if concept is not None and concept not in concepts:
            concepts.append(concept)
    return concepts


def concepts_of(analysis: dict) -> dict[str, tuple[str, ...]]:
    """분석 결과 한 건(필드 → 문자열 목록) → 필드 → 개념 id. 빈 필드는 뺀다."""
    found = {field: tuple(normalize_values(field, analysis.get(field) or ())) for field in FIELDS}
    return {field: ids for field, ids in found.items() if ids}
