-- 템플릿 슬롯 힌트를 개념 사전의 id 로 바꾼다(docs/plans/content-vocabulary.md §2.1 · §6 의 4).
--
-- 채점이 부분 문자열 매칭에서 개념 매칭으로 바뀌므로(apps/api/src/services/recommendation/score-slots.ts),
-- 힌트도 자유 문자열이 아니라 packages/shared-types/src/content-vocabulary.json 의 개념 id 여야 한다.
-- 사전에 없는 id 는 조용히 0점이 되므로 movie-templates.test.ts 가 전부 사전에 있는지 본다.
--
-- 옮기면서 빠지는 것: 상태·구도(실내 · 외관)와 여정의 사건(나서 · 출발 · 도착 · 돌아) — 3초 프레임으로 구분되지 않고
-- temporalPrior 가 그 자리를 맡는다. walk/view 의 하늘은 places 에서 objects 로, cafe/front 의 입구는 objects 에서
-- places 로 옮긴다. temporalPrior 와 walk/hero(힌트 없음)는 그대로다.

UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["home", "station", "entrance"], "objects": ["door", "stairs", "exit"], "actions": [], "topics": ["walk"], "temporalPrior": 0.0}'::jsonb WHERE "template_id" = 'walk' AND "slot_id" = 'start';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["alley", "street", "residential_area"], "objects": ["wall", "stairs"], "actions": ["walk"], "topics": ["walk"], "temporalPrior": 0.25}'::jsonb WHERE "template_id" = 'walk' AND "slot_id" = 'alley';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["shop", "market"], "objects": ["signboard", "display_window"], "actions": [], "topics": [], "temporalPrior": 0.45}'::jsonb WHERE "template_id" = 'walk' AND "slot_id" = 'shop';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["scenery", "park", "river"], "objects": ["tree", "building", "sunset", "sky"], "actions": [], "topics": [], "temporalPrior": 0.8}'::jsonb WHERE "template_id" = 'walk' AND "slot_id" = 'view';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["street", "alley"], "objects": [], "actions": ["walk"], "topics": [], "temporalPrior": 1.0}'::jsonb WHERE "template_id" = 'walk' AND "slot_id" = 'back';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["home", "bedroom", "kitchen", "cafe"], "objects": ["coffee", "window", "bedding"], "actions": [], "topics": [], "temporalPrior": 0.0}'::jsonb WHERE "template_id" = 'day' AND "slot_id" = 'morning';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["office", "school", "cafe", "street"], "objects": [], "actions": [], "topics": [], "temporalPrior": 0.35}'::jsonb WHERE "template_id" = 'day' AND "slot_id" = 'noon';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["restaurant", "street", "home"], "objects": ["sunset", "lighting"], "actions": [], "topics": [], "temporalPrior": 0.75}'::jsonb WHERE "template_id" = 'day' AND "slot_id" = 'evening';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["home", "bedroom"], "objects": ["lighting"], "actions": [], "topics": [], "temporalPrior": 1.0}'::jsonb WHERE "template_id" = 'day' AND "slot_id" = 'closing';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["cafe", "shop", "entrance"], "objects": ["signboard", "door"], "actions": [], "topics": ["cafe"], "temporalPrior": 0.0}'::jsonb WHERE "template_id" = 'cafe' AND "slot_id" = 'front';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["cafe"], "objects": ["menu"], "actions": [], "topics": ["cafe"], "temporalPrior": 0.2}'::jsonb WHERE "template_id" = 'cafe' AND "slot_id" = 'menu';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["cafe"], "objects": ["coffee", "drink", "cup", "cake", "dessert"], "actions": ["show"], "topics": ["cafe", "dessert"], "temporalPrior": 0.5}'::jsonb WHERE "template_id" = 'cafe' AND "slot_id" = 'drink';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["cafe"], "objects": ["seat", "chair", "table", "lighting", "window"], "actions": [], "topics": ["cafe"], "temporalPrior": 0.7}'::jsonb WHERE "template_id" = 'cafe' AND "slot_id" = 'room';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["cafe"], "objects": ["cup", "hand"], "actions": ["drink", "hold"], "topics": ["cafe"], "temporalPrior": 1.0}'::jsonb WHERE "template_id" = 'cafe' AND "slot_id" = 'sip';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["station", "train", "bus", "car", "road"], "objects": ["window", "seat"], "actions": ["ride", "move"], "topics": ["travel"], "temporalPrior": 0.0}'::jsonb WHERE "template_id" = 'trip' AND "slot_id" = 'leave';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["station", "entrance", "square", "street"], "objects": ["signboard"], "actions": [], "topics": ["travel"], "temporalPrior": 0.2}'::jsonb WHERE "template_id" = 'trip' AND "slot_id" = 'arrive';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["tourist_spot", "sea", "mountain", "park", "exhibition"], "objects": [], "actions": ["look_around"], "topics": ["travel", "sightseeing"], "temporalPrior": 0.45}'::jsonb WHERE "template_id" = 'trip' AND "slot_id" = 'main';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["restaurant", "cafe"], "objects": ["food", "bowl", "coffee", "cup"], "actions": ["eat"], "topics": ["food_spot"], "temporalPrior": 0.65}'::jsonb WHERE "template_id" = 'trip' AND "slot_id" = 'food';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["scenery", "sea", "mountain"], "objects": ["building", "sky"], "actions": [], "topics": ["travel"], "temporalPrior": 0.85}'::jsonb WHERE "template_id" = 'trip' AND "slot_id" = 'wide';
UPDATE "movie_template_slots" SET "match_hints" = '{"places": ["station", "car", "road"], "objects": ["window"], "actions": [], "topics": ["travel"], "temporalPrior": 1.0}'::jsonb WHERE "template_id" = 'trip' AND "slot_id" = 'home';
