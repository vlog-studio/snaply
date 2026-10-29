-- 무비마다 고르는 맞춤 방식(specs MOV-8). 기존 무비는 지금까지와 같은 흐린 배경.
ALTER TABLE "movies" ADD COLUMN "fit_mode" VARCHAR(20) NOT NULL DEFAULT 'blur_background';
