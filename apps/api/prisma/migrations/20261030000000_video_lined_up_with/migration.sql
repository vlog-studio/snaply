-- 촬영 가이드로 겹쳐 보며 이어 찍은 앞 컷(짝)의 앱 id(specs SNAP-24 · decisions/capture-coach.md §4.2). 서버는 해석하지 않고,
-- 편집할 때 무비에 든 스냅 안에서 영상 id 나 client_id 로 찾는다. 이 전의 스냅은 짝이 없다.
ALTER TABLE "videos" ADD COLUMN "lined_up_with_client_id" VARCHAR(128);
