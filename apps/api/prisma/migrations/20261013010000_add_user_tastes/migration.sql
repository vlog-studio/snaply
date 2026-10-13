-- 사용자 취향 프로필(docs/decisions/ontology-personalization.md §4, specs PRF-1 · PRF-2 · PRF-4).
--
-- 개념 하나에 한 행이다. 가중치는 마지막 신호 시각(updated_at) 기준의 값이고 읽을 때 시간 감쇠를 적용한다.
-- 분석 동의를 철회하면 내용 개념의 derived 행을, 계정을 지우면 전부(FK cascade) 지운다.

CREATE TABLE "user_tastes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "field" VARCHAR(20) NOT NULL,
    "concept" VARCHAR(50) NOT NULL,
    "source" VARCHAR(10) NOT NULL DEFAULT 'derived',
    "weight" DOUBLE PRECISION NOT NULL,
    "evidence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_tastes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_tastes_user_id_field_concept_source_key" ON "user_tastes"("user_id", "field", "concept", "source");

ALTER TABLE "user_tastes" ADD CONSTRAINT "user_tastes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
