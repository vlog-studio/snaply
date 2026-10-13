-- AI 편집 에이전트의 계획을 초안과 함께 남긴다(specs MOV-25, docs/decisions/ai-edit-agent.md §4).
--
-- mode: agent(에이전트가 끝까지 돌았다) · rules(에이전트를 쓸 수 없다) · fallback(에이전트가 실패해 규칙으로 만들었다).
-- 지금까지의 행은 모두 규칙으로 만든 것이라 기본값 rules 다.

ALTER TABLE "movie_drafts" ADD COLUMN "mode" VARCHAR(10) NOT NULL DEFAULT 'rules';
ALTER TABLE "movie_drafts" ADD COLUMN "plan" JSONB;
