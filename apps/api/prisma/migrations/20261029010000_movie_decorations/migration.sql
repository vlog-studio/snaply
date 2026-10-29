-- 무비의 꾸밈(specs MOV-27 · decisions/text-accent-stickers.md §9) — 글자 · 이모지 · 얼굴 스티커를 각각 켜고 끈다.
ALTER TABLE "movies"
  ADD COLUMN "decor_text" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "decor_emoji" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "decor_face" BOOLEAN NOT NULL DEFAULT false;

-- 기존 무비는 레시피의 기본값(recipe-vocabulary.json `decorations`)으로 — 지금까지 붙던 것과 같다. classic 은 셋 다 꺼짐.
UPDATE "movies" SET "decor_text" = true
  WHERE "recipe" IN ('trend-routine', 'trend-montage', 'cinematic', 'fast-cut', 'beat-sync', 'speed-ramp', 'before-after', 'freeze-text', 'whip-montage', 'letterbox-montage', 'talk-vlog', 'daylog');
UPDATE "movies" SET "decor_emoji" = true
  WHERE "recipe" IN ('trend-routine', 'trend-montage', 'cinematic', 'fast-cut', 'beat-sync', 'speed-ramp', 'whip-montage', 'letterbox-montage', 'talk-vlog');
UPDATE "movies" SET "decor_face" = true
  WHERE "recipe" IN ('trend-routine', 'trend-montage', 'cinematic', 'fast-cut', 'beat-sync', 'whip-montage', 'letterbox-montage');
