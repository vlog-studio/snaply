-- 이미 지운 무비의 결과물을 사용자가 지운 것으로 표시한다(specs/movie.md MOV-26).
-- 이제는 무비를 지울 때 결과물도 함께 지우지만(movie.service.ts deleteMovie), 그 전에 지운 무비의 결과물은 행이 살아 있어
-- 30일 상한(MOV-16 — 살아 있는 무비만 본다)에도 남은 객체 정리(지운 행만 본다)에도 걸리지 않고 파일이 영영 남았다.
-- 지운 것으로 표시해 두면 다음 정리 배치(media:purge-expired ③)가 파일을 지우고 purged_at 을 남긴다.
UPDATE "videos" AS v
SET "deleted_at" = m."deleted_at", "status" = 'deleted', "removal_reason" = 'user'
FROM "movies" AS m
WHERE m."result_video_id" = v."id"
  AND m."deleted_at" IS NOT NULL
  AND v."deleted_at" IS NULL
  AND v."kind" = 'result';
