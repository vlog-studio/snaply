-- 연동을 해제한 사용자의 게시 이력에 남은 플랫폼 값(게시물 ID · 플랫폼이 준 실패 사유)을 지운다(backlog E-39).
-- 이제는 해제하거나 다른 계정으로 바꿀 때 지우지만(sns.service.ts forgetPlatformValues), 그 전에 해제한 사용자의 값은
-- 연동이 없어 Meta 의 삭제 요청으로 찾을 수 없었다. 게시 이력 행 자체는 Snaply 의 기록이라 남긴다(SNS-9).
UPDATE "sns_uploads" AS u
SET "platform_post_id" = NULL, "error_message" = NULL
WHERE (u."platform_post_id" IS NOT NULL OR u."error_message" IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM "sns_connections" AS c
    WHERE c."user_id" = u."user_id" AND c."platform" = u."platform"
  );
