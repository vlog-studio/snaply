-- AI 편집 에이전트가 초안에서 정한 분위기(specs MOV-25, docs/decisions/ai-edit-agent.md §3.2).
-- 무비를 만들 때 그 무비의 초안에서 옮겨 두고, AI 가 경계의 전환을 고를 때(만들 때 · 컷이나 스타일을 고칠 때) 쓴다.

ALTER TABLE "movies" ADD COLUMN "mood" VARCHAR(20);
