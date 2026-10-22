# 효과음 에셋

트렌드 레시피의 효과음(`pipeline/sfx.py`)이 쓰는 소리다. 어떤 소리를 어디에 쓰는지는 사전
`packages/shared-types/src/sfx-vocabulary.json` 이 정하고, 사전에 있는데 파일이 없으면 `tests/test_sfx.py` 가 실패한다.

- 출처 · 라이선스: 전부 Pixabay 효과음(Pixabay Content License — 무료 · 출처 표기 불필요 · 영상에 섞어 쓰기 허용, 소리 자체를 단독 배포하는 것만
  금지, https://pixabay.com/service/license-summary/). 확인일 2026-10-22. `freesound_community` 는 Freesound 에서 Pixabay 로 옮겨 온 소리다.
- 긴 소리(지글지글 · 발소리 · 타자)는 사전의 `maxMs` 만큼 앞부분만 쓴다. 원본은 고치지 않는다.
- 에셋 팩 매니페스트(docs/plans/asset-pack-manifest.md)가 들어오면 버킷의 버전드 팩으로 옮긴다.

| 파일 | 원래 이름 | 출처 |
|---|---|---|
| `apple-bite.mp3` | Apple Bite by freesound_community | https://pixabay.com/sound-effects/film-special-effects-apple-bite-85720/ |
| `crunch-chips.mp3` | Bite potato chips by freesound_community | https://pixabay.com/sound-effects/people-bite-potato-chips-83946/ |
| `gulp.mp3` | Gulp by freesound_community | https://pixabay.com/sound-effects/people-gulp-37759/ |
| `slurp.mp3` | coffee slurp 7 by freesound_community | https://pixabay.com/sound-effects/people-coffee-slurp-7-94517/ |
| `sizzle.mp3` | Sizzling Frying Pan by VoiceBosch | https://pixabay.com/sound-effects/household-sizzling-frying-pan-201293/ |
| `glass-clink.mp3` | Glass Clink by freesound_community | https://pixabay.com/sound-effects/film-special-effects-glass-clink-57538/ |
| `water-splash.mp3` | Water splash by freesound_community | https://pixabay.com/sound-effects/film-special-effects-water-splash-46402/ |
| `whoosh.mp3` | Simple Whoosh by DRAGON-STUDIO | https://pixabay.com/sound-effects/film-special-effects-simple-whoosh-382724/ |
| `swoosh-fast.mp3` | Fast Swoosh by Universfield | https://pixabay.com/sound-effects/film-special-effects-fast-swoosh-383967/ |
| `camera-shutter.mp3` | Camera Shutter by freesound_community | https://pixabay.com/sound-effects/technology-camera-shutter-6305/ |
| `door.mp3` | door-open-close by freesound_community | https://pixabay.com/sound-effects/household-door-open-close-45475/ |
| `car-door.mp3` | car door close by freesound_community | https://pixabay.com/sound-effects/film-special-effects-car-door-close-6929/ |
| `footsteps.mp3` | concrete footsteps 1 by freesound_community | https://pixabay.com/sound-effects/film-special-effects-concrete-footsteps-1-6265/ |
| `pop.mp3` | Pop! by DRAGON-STUDIO | https://pixabay.com/sound-effects/film-special-effects-pop-402323/ |
| `bubble-pop.mp3` | Bubble Pop 06 by Universfield | https://pixabay.com/sound-effects/film-special-effects-bubble-pop-06-351337/ |
| `ding.mp3` | Ding~ by u_31vnwfmzt6 | https://pixabay.com/sound-effects/film-special-effects-ding-126626/ |
| `sparkle.mp3` | Sound Effect: Twinkle/Sparkle by ShidenBeatsMusic | https://pixabay.com/sound-effects/film-special-effects-sound-effect-twinklesparkle-115095/ |
| `typing.mp3` | Keyboard Typing Fast by VirtualZero | https://pixabay.com/sound-effects/film-special-effects-keyboard-typing-fast-371229/ |
| `paper-bag.mp3` | Paper Bag - Rustling Through it 1 by DOBCommunications | https://pixabay.com/sound-effects/film-special-effects-paper-bag-rustling-through-it-1-284814/ |
