-- 무비의 편집 선택(specs MOV-29 · decisions/trend-recipes.md §25) — 말소리 살리기 · 장면 단위 순서. 기본 꺼짐 — 기존 무비는 지금과 같다.
ALTER TABLE "movies"
  ADD COLUMN "edit_speech" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "edit_scene_order" BOOLEAN NOT NULL DEFAULT false;
