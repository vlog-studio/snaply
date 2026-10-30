-- 가로 영상의 남는 자리는 검은 띠가 기본(specs MOV-8 · decisions/text-accent-stickers.md §10, 2026-10-30 사용자 결정).
-- 앱에 맞춤을 고르는 화면이 없어 기존 무비는 모두 기본값(흐린 원본)이었다 — 그 값도 검은 띠로 옮긴다.
ALTER TABLE "movies" ALTER COLUMN "fit_mode" SET DEFAULT 'pad_black';
UPDATE "movies" SET "fit_mode" = 'pad_black' WHERE "fit_mode" = 'blur_background';
