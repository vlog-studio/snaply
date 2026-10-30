/**
 * 짝 스냅(`linedUpWithClientId`, SNAP-24)의 등록 계약을 고정한다.
 *
 * 촬영 가이드로 겹쳐 보며 이어 찍은 앞 스냅의 앱 id 다. 서버는 해석하지 않고 저장만 하고, 편집기가 무비 안에서
 * 찾는다(decisions/capture-coach.md §4.2). 실제 저장은 S3 에 올라간 객체가 있어야 지나는 경로라(`confirmUpload`)
 * `video-captured-at.test.ts` 와 같이 여기서는 계약만 검사한다.
 */
import { describe, expect, it } from 'vitest';
import { VIDEO_CLIENT_ID_MAX_LENGTH, createVideoBodySchema } from '@vlog-studio/shared-types';

const videoId = '8f14e45f-ceea-467a-9e1b-1c3a2b4d5e6f';

describe('POST /videos 요청의 linedUpWithClientId', () => {
  it('앞 스냅의 앱 id 를 그대로 받는다', () => {
    const parsed = createVideoBodySchema.parse({
      videoId,
      clientId: 'snaply-1727400000000.mp4',
      linedUpWithClientId: 'snaply-1727399990000.mp4',
    });

    expect(parsed.linedUpWithClientId).toBe('snaply-1727399990000.mp4');
  });

  it('서버에서 받은 스냅의 영상 id 도 받는다 — 앱 id 가 곧 영상 id 인 스냅이다', () => {
    const parsed = createVideoBodySchema.parse({ videoId, linedUpWithClientId: videoId });

    expect(parsed.linedUpWithClientId).toBe(videoId);
  });

  it('생략할 수 있다 — 가이드 없이 찍은 스냅은 짝이 없다', () => {
    const parsed = createVideoBodySchema.parse({ videoId });

    expect(parsed.linedUpWithClientId).toBeUndefined();
  });

  it('빈 문자열이나 clientId 보다 긴 값은 거부한다', () => {
    for (const bad of ['', 'x'.repeat(VIDEO_CLIENT_ID_MAX_LENGTH + 1)]) {
      expect(createVideoBodySchema.safeParse({ videoId, linedUpWithClientId: bad }).success).toBe(false);
    }
  });
});
