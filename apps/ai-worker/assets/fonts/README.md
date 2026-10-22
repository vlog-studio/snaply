# 워커 번들 글꼴

ASS 자막 · 텍스트 액센트 · 고정 타이틀을 구울 때 ffmpeg `ass` 필터가 `fontsdir` 로 읽는 글꼴이다(`pipeline/ass.py` `FONTS_DIR`).
시스템 글꼴로 대체되면 한글 글리프가 없어 빈 네모가 되므로, 스타일의 글꼴 이름은 아래 **패밀리 이름**과 같아야 한다 —
`tests/test_ass.py` 가 묶는다.

| 파일 | 패밀리 이름 | 쓰는 곳 | 라이선스 |
|---|---|---|---|
| `PretendardGOV-Bold.ttf` | Pretendard GOV | 말소리 자막 · 키워드 액센트 | SIL OFL 1.1 — `OFL-Pretendard.txt` (앱 `apps/mobile/assets/fonts` 와 같은 파일) |
| `BlackHanSans-Regular.ttf` | Black Han Sans | 의성어 액센트 | SIL OFL 1.1 — `OFL-BlackHanSans.txt` (Google Fonts) |
| `Jua-Regular.ttf` | Jua | 느낌 액센트 | SIL OFL 1.1 — `OFL-Jua.txt` (Google Fonts) |
| `DoHyeon-Regular.ttf` | Do Hyeon | 감탄 액센트 | SIL OFL 1.1 — `OFL-DoHyeon.txt` (Google Fonts) |
| `D2Coding-Bold.ttf` | D2Coding | 고정 타이틀 `typewriter`("vlog / 부제") | SIL OFL 1.1 — `OFL-D2Coding.txt` (앱과 같은 파일) |
| `Gaegu-Bold.ttf` | Gaegu | 고정 타이틀 `script`("Mini VLog") | SIL OFL 1.1 — `OFL-Gaegu.txt` (앱과 같은 파일) |

OFL 은 글꼴 파일을 그대로 함께 배포하는 것과 결과물(영상)에 쓰는 것을 허용한다. 글꼴을 고치면 이름을 바꿔야 한다
(Reserved Font Name). 액센트 스타일이 에셋 팩으로 옮겨 가면 이 글꼴도 팩 매니페스트가 갖는다(docs/decisions/text-accent-stickers.md).
