-- AI 편집 초안 과금(specs CRD-9, docs/decisions/ai-edit-agent.md §5).
--
-- 초안에 쓴 크레딧을 초안 기록에 두고(무료 횟수는 mode = agent 이고 charged_credits = 0 인 행을 센다), 원장의 비용 · 환급 행이
-- 어느 초안의 것인지 남긴다. 원장의 movie_draft_id 에는 FK 를 두지 않는다 — 분석 동의 철회가 초안 기록을 지워도 원장은 남는다.

ALTER TABLE "movie_drafts" ADD COLUMN "charged_credits" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "credit_ledger" ADD COLUMN "movie_draft_id" UUID;

CREATE UNIQUE INDEX "credit_ledger_movie_draft_id_reason_key" ON "credit_ledger"("movie_draft_id", "reason");
