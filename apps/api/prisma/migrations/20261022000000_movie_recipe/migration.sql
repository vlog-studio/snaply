-- 무비의 편집 스타일 레시피(specs MOV-28). 기존 무비는 지금까지와 같은 classic.
ALTER TABLE "movies" ADD COLUMN "recipe" VARCHAR(30) NOT NULL DEFAULT 'classic';
