-- 스냅 분석의 프레임별 피사체 상자(specs ANA-2 · decisions/subject-boxes.md). 이 전의 분석(프롬프트 v1)은 빈 배열 — 꾸밈은 화면 모서리에 놓인다.
ALTER TABLE "video_analyses" ADD COLUMN "subjects" JSONB NOT NULL DEFAULT '[]';
