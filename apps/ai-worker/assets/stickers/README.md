# 이모지 스티커 에셋

텍스트 액센트와 함께 붙는 이모지 스티커의 원본 이미지다(`pipeline/sticker.py`). 파일 이름은 유니코드 코드포인트(`1f525.png`)이고,
액센트 사전(`packages/shared-types/src/accent-vocabulary.json` 의 `stickers.byConcept`)이 이 이름으로 가리킨다 — 사전에 있는데 파일이
없으면 `tests/test_accent_vocabulary.py` 가 실패한다.

- 출처: Google Noto Emoji `v2.047` 태그의 `png/512/emoji_u{코드포인트}.png` (https://github.com/googlefonts/noto-emoji)
- 라이선스: 그 태그의 `LICENSE`(SIL OFL 1.1)를 그대로 둔다 — `LICENSE-noto-emoji.txt`. 같은 태그의 README 는 "이미지 자원 대부분은
  Apache 2.0" 이라고도 적어 두 문서가 어긋난다. 둘 다 상업적 사용 · 재배포를 허용하지만, 출시 전 법무 확인 대상이다
  (docs/decisions/text-accent-stickers.md, backlog).
- 스티커 모양(흰 칼선 테두리 · 그림자)은 렌더할 때 입힌다. 원본은 고치지 않는다.

에셋 팩 매니페스트(docs/plans/asset-pack-manifest.md)가 들어오면 이 디렉터리는 버킷의 버전드 팩으로 옮긴다.
