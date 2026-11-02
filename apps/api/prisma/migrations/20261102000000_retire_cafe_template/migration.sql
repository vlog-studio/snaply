-- `카페 한 곳` 템플릿을 내린다. 다섯 칸(외관 · 메뉴판 · 음료 · 공간 · 한 모금)이 모두 카페 장면을 요구하는데, 앱의 첫 매칭은
-- 촬영 시각 · 위치로 외출 하나를 찾을 뿐 내용을 보지 않아 초원이 `메뉴판` 칸에 들어가는 식으로 칸 이름과 내용이 가장 크게 어긋났다
-- (2026-11-02 오너 결정). 행을 지우지 않는 것은 그 템플릿으로 만든 과거 추천이 고아가 되기 때문이다(schema.prisma `retiredAt`).
-- 앱 내장 폴백 카탈로그(movie-template-catalog.ts)에서도 같은 커밋에서 뺀다.

UPDATE "movie_templates" SET "retired_at" = CURRENT_TIMESTAMP, "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = 'cafe' AND "retired_at" IS NULL;
