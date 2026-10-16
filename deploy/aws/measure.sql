-- 실측 집계 — 한 계정의 스냅 분석(A-3)과 AI 편집 초안(A-12 · A-14)을 숫자로 낸다.
-- 운영 DB 를 읽기만 한다. 사용법은 docs/deployment-aws.md "실측 집계".
--
--   docker compose --env-file .env exec -T postgres psql -U postgres -d snaply -v uid=<USER_ID> < deploy/aws/measure.sql
--
-- 단가(원)는 여기서 곱하지 않는다 — 모델 단가와 환율을 그날 값으로 적어 따로 환산한다(A-14 "AI 편집 1회 실제 비용").

\set ON_ERROR_STOP on
\pset footer off

\echo '== A-3 스냅 분석 — 상태 · 모델별 처리 시간 · 토큰 · 프레임'
SELECT model_version, prompt_version, status,
       count(*)                                                                                        AS n,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM completed_at - started_at))::numeric, 1) AS p50_sec,
       round(percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM completed_at - started_at))::numeric, 1) AS p90_sec,
       round(avg(input_tokens))  AS avg_in,
       round(avg(output_tokens)) AS avg_out,
       sum(input_tokens)         AS sum_in,
       sum(output_tokens)        AS sum_out,
       round(avg(cardinality(frame_timestamps_ms)), 2) AS avg_frames,
       round(avg(attempts), 2)   AS avg_attempts
FROM video_analyses
WHERE user_id = :'uid'
GROUP BY model_version, prompt_version, status
ORDER BY model_version, status;

\echo '== A-3 실패 사유'
SELECT error_code, count(*) AS n
FROM video_analyses
WHERE user_id = :'uid' AND status <> 'done'
GROUP BY error_code
ORDER BY n DESC;

\echo '== A-3 유사 프레임 제거 — 보낸 프레임 수의 분포(최대 4)'
SELECT cardinality(frame_timestamps_ms) AS frames, count(*) AS n
FROM video_analyses
WHERE user_id = :'uid' AND status = 'done'
GROUP BY 1
ORDER BY 1;

\echo '== A-3 사람 채점용 — 스냅마다 분석 결과(요약 · 개념 · 품질 · usableForEdit)'
SELECT a.video_id, v.captured_at, a.summary, a.places, a.objects, a.actions, a.topics, a.moods,
       a.visual_issues, round(a.visual_quality_score::numeric, 2) AS quality, a.usable_for_edit, round(a.confidence::numeric, 2) AS confidence
FROM video_analyses a
JOIN videos v ON v.id = a.video_id
WHERE a.user_id = :'uid' AND a.status = 'done'
ORDER BY v.captured_at NULLS LAST, a.video_id;

\echo '== A-12 · A-14 AI 편집 초안 — 모드별 수 · 에이전트 시간 · 왕복 · 토큰'
SELECT mode,
       count(*) AS n,
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY (plan->'usage'->>'ms')::numeric) / 1000)::numeric, 1) AS p50_sec,
       round((percentile_cont(0.9) WITHIN GROUP (ORDER BY (plan->'usage'->>'ms')::numeric) / 1000)::numeric, 1) AS p90_sec,
       round(avg((plan->'usage'->>'turns')::numeric), 1)        AS avg_turns,
       round(avg((plan->'usage'->>'inputTokens')::numeric))     AS avg_in,
       round(avg((plan->'usage'->>'outputTokens')::numeric))    AS avg_out,
       sum((plan->'usage'->>'inputTokens')::numeric)            AS sum_in,
       sum((plan->'usage'->>'outputTokens')::numeric)           AS sum_out,
       sum(charged_credits)                                      AS credits
FROM movie_drafts
WHERE user_id = :'uid'
GROUP BY mode
ORDER BY mode;

\echo '== A-14 에이전트 성공률 — agent / (agent + fallback). rules 는 에이전트를 쓰지 않은 초안이라 빠진다'
SELECT count(*) FILTER (WHERE mode = 'agent')    AS agent,
       count(*) FILTER (WHERE mode = 'fallback') AS fallback,
       round(count(*) FILTER (WHERE mode = 'agent')::numeric
             / nullif(count(*) FILTER (WHERE mode IN ('agent', 'fallback')), 0), 3) AS success_rate
FROM movie_drafts
WHERE user_id = :'uid';

\echo '== A-14 검토 — 첫 select_cuts 의 통과율 · 초안당 select_cuts 수(재시도 = 수 - 1) · 초점 개념을 쓴 비율 · 분위기를 정한 비율'
WITH steps AS (
  SELECT d.id,
         s.ordinality AS i,
         s.value      AS step
  FROM movie_drafts d,
       jsonb_array_elements(d.plan->'steps') WITH ORDINALITY s
  WHERE d.user_id = :'uid' AND d.mode = 'agent' AND s.value->>'tool' = 'select_cuts'
), per_draft AS (
  SELECT id,
         count(*) AS selections,
         bool_or(i = (SELECT min(i) FROM steps s2 WHERE s2.id = steps.id)
                 AND (step->'outcome'->'review'->>'passed')::boolean) AS first_passed
  FROM steps
  GROUP BY id
)
SELECT count(*)                                                  AS drafts_with_selection,
       round(avg(first_passed::int), 3)                          AS first_pass_rate,
       round(avg(selections - 1), 2)                             AS avg_retries,
       (SELECT round(avg((jsonb_array_length(plan->'direction'->'focusKeys') > 0)::int), 3)
          FROM movie_drafts WHERE user_id = :'uid' AND mode = 'agent')                     AS focus_used_rate,
       (SELECT round(avg((plan->>'mood' IS NOT NULL)::int), 3)
          FROM movie_drafts WHERE user_id = :'uid' AND mode = 'agent')                     AS mood_picked_rate
FROM per_draft;

\echo '== A-14 초안이 요청한 분석의 토큰 — 초안 1회 비용에 더한다(같은 계정 · 초안 시각 앞뒤 2분 안의 분석)'
SELECT d.id AS draft_id, d.created_at,
       (d.plan->'usage'->>'inputTokens')::int  AS agent_in,
       (d.plan->'usage'->>'outputTokens')::int AS agent_out,
       coalesce(sum(a.input_tokens), 0)  AS analysis_in,
       coalesce(sum(a.output_tokens), 0) AS analysis_out
FROM movie_drafts d
LEFT JOIN video_analyses a
  ON a.user_id = d.user_id AND a.status = 'done'
 AND a.created_at BETWEEN d.created_at - interval '2 minutes' AND d.created_at + interval '2 minutes'
WHERE d.user_id = :'uid' AND d.mode = 'agent'
GROUP BY d.id
ORDER BY d.created_at;
