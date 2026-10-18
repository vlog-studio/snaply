-- 어떤 무비도 가리키지 않는 결과물을 사용자가 지운 것으로 표시한다(specs/movie.md MOV-23).
-- 이제는 다시 만들기를 시작할 때 대신한 이전 결과물을 지운 것으로 만들지만(movie.service.ts exportMovie), 그 전에 대신한
-- 결과물은 행이 살아 있어 30일 상한(MOV-16 — 무비가 가리키는 결과물만 본다)에도 남은 객체 정리(지운 행만 본다)에도 걸리지 않고
-- 파일이 영영 남았다. 2026-10-11 에 없앤 `POST /edit-jobs` 로 만든 무비 없는 결과물도 같은 처지다 — 앱은 결과물을 무비로만
-- 보여 주므로(`GET /videos?kind=source`) 둘 다 사용자에게 닿지 않는다. 결과물의 사라진 사유는 화면에 드러나지 않는다.
-- 지운 무비의 결과물은 20261017000000_discard_results_of_deleted_movies 가 맡는다(무비가 가리키므로 여기 걸리지 않는다).
-- 작업이 아직 도는 결과물은 건드리지 않는다 — 방금 시작한 생성은 무비에 걸리기 직전일 수 있다.
-- 지운 것으로 표시해 두면 다음 정리 배치(media:purge-expired ③)가 파일을 지우고 purged_at 을 남긴다.
UPDATE "videos" AS v
SET "deleted_at" = now(), "status" = 'deleted', "removal_reason" = 'user'
WHERE v."kind" = 'result'
  AND v."deleted_at" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "movies" AS m WHERE m."result_video_id" = v."id")
  AND NOT EXISTS (
    SELECT 1 FROM "edit_jobs" AS j
    WHERE j."video_id" = v."id" AND j."status" IN ('queued', 'processing')
  );
