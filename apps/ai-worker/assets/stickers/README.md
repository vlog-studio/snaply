# 스티커 에셋

텍스트 액센트와 함께 붙는 그림 스티커의 원본 이미지다(`pipeline/sticker.py` · 얼굴 스티커 `pipeline/face.py`). 파일 이름이 스티커 이름(`sk-6196.png`)이고,
액센트 사전(`packages/shared-types/src/accent-vocabulary.json` 의 `stickers.byConcept` · `decor` · `sparkle`)이 이 이름으로 가리킨다 — 사전에 있는데 파일이
없으면 `tests/test_accent_vocabulary.py` 가 실패한다.

- 렌더는 원본 그림을 그대로 그린다(테두리 · 그림자 없음, 2026-10-29 — 예전엔 흰 칼선 · 그림자를 입혔다). 원본은 고치지 않는다.
- 예전엔 Google Noto Emoji(`{코드포인트}.png` 102장, SIL OFL 1.1)도 있었다 — 2026-10-30 지우고 아래 그림만 쓴다
  (docs/decisions/text-accent-stickers.md §10).

에셋 팩 매니페스트(docs/plans/asset-pack-manifest.md)가 들어오면 이 디렉터리는 버킷의 버전드 팩으로 옮긴다.

## 직접 받은 그림 (`sk-*`)

이모지가 아닌 그림 스티커 411개 — 2026-10-29 개발용으로 넣었다.

- 출처: [seukku.cc](https://seukku.cc/). 파일 이름의 숫자는 그 사이트의 번호(번호가 없던 넷은 `sk-butterfly` · `sk-clover` · `sk-note` · `sk-note2`)
- **라이선스 미확인** — 캐릭터 · 상표 그림과 밈 문구가 섞여 있다. 출시 전에 확인하거나 뺀다(backlog A-19, docs/decisions/sticker-asset-sourcing.md)
- 손질: 투명 여백을 잘라 내고 가운데 정렬로 정사각형(여백 6%) · 최대 320px PNG — 렌더는 최대 300px(`stickers.sizePx`)이고 정사각형으로 늘리기 때문이다
- 사전에는 `stickers.byConcept` 에 있고, 어디에나 어울리는 장식은 `stickers.decor` 에도 있다(사람 · 소파 · 분위기 같은 일반 개념은 이 안에서만 고른다).
  이모지 문자가 없어 생성(층 c)이 고를 수 없으므로 `generatedPool` 은 비어 있다
  (넣으면 `accent_writer.emoji_char` 가 이름을 코드포인트로 읽다 실패한다)
- 개념은 그림 이름의 주제(생일 · 먹기 · 반려동물 · 음악 · 꽃 · 하트 · 반짝이 · 일상 한탄 등)별로 어울리는 장면을 넓게 붙였다 — 장당 평균 약 22개,
  내용 개념 111개를 모두 덮는다
