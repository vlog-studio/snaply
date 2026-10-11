-- 무비 결과물 만료 예고(NTF-10). 같은 결과물 · 같은 예고일에 한 번만 — 기존 @@unique 가 막는다.
ALTER TYPE "NotificationKind" ADD VALUE 'movie_expiry';
