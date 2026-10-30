/**
 * 촬영 코치의 앞 컷 해석(SNAP-25) — 동의 · 스위치가 모델 호출을 막는지, 모델의 답을 계약대로 다듬는지, 실패가 502 로 끝나는지.
 * 모델은 각본으로 끼운다(실제 OpenAI 를 부르지 않는다).
 * 결정: docs/decisions/capture-coach.md §6
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';
import { createConsentedUser } from './helpers/consent.js';
import {
  setCaptureCoachModelForTests,
  type CaptureCoachModel,
} from '../src/services/capture-coach.service.js';

// 1×1 JPEG — 형식만 맞으면 된다. 각본 모델은 장면을 보지 않는다.
const IMAGE = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

let h: Harness;
let calls: string[];

function scripted(answer: string | Error): CaptureCoachModel {
  return {
    name: 'scripted-luna',
    read: async (image) => {
      calls.push(image);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

function read(user: TestUser, image = IMAGE) {
  return h.app.inject({
    method: 'POST',
    url: '/capture-coach/previous-cut',
    headers: user.auth,
    payload: { image },
  });
}

beforeAll(async () => {
  h = await createHarness({ MOVIE_RECOMMENDATION_ENABLED: 'true' });
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.resetDb();
  calls = [];
});
afterEach(() => {
  setCaptureCoachModelForTests(null);
});

describe('POST /capture-coach/previous-cut', () => {
  it('reads the scene, keeps coordinates in range and names the model', async () => {
    setCaptureCoachModelForTests(() =>
      scripted(
        JSON.stringify({
          scene: 'food',
          subject: { cx: 0.33, cy: 1.4, size: 0.35 },
          advice: '다음 메뉴도 같은 자리에 두고 찍어 보세요',
        }),
      ),
    );
    const user = await createConsentedUser(h);

    const res = await read(user);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      scene: 'food',
      subject: { cx: 0.33, cy: 1, size: 0.35 },
      advice: '다음 메뉴도 같은 자리에 두고 찍어 보세요',
      model: 'scripted-luna',
    });
    expect(calls).toEqual([IMAGE]);
  });

  it('never sends the frame without analysis consent', async () => {
    setCaptureCoachModelForTests(() => scripted('{}'));
    const user = await h.createUser();

    const res = await read(user);

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ANALYSIS_CONSENT_REQUIRED');
    expect(calls).toEqual([]);
  });

  it('is unavailable without a model key', async () => {
    setCaptureCoachModelForTests(() => null);
    const user = await createConsentedUser(h);

    const res = await read(user);

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('CAPTURE_COACH_UNAVAILABLE');
  });

  it('answers 502 when the model fails or answers out of shape', async () => {
    const user = await createConsentedUser(h);

    setCaptureCoachModelForTests(() => scripted(new Error('timeout')));
    expect((await read(user)).statusCode).toBe(502);

    setCaptureCoachModelForTests(() => scripted(JSON.stringify({ scene: 'moon', subject: null, advice: 'x' })));
    const res = await read(user);
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('CAPTURE_COACH_FAILED');
  });

  it('rejects a body that is not base64', async () => {
    setCaptureCoachModelForTests(() => scripted('{}'));
    const user = await createConsentedUser(h);

    const res = await read(user, 'data:image/jpeg;base64,abc');

    expect(res.statusCode).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe('POST /capture-coach/previous-cut with analysis switched off', () => {
  let off: Harness;

  beforeAll(async () => {
    off = await createHarness({ MOVIE_RECOMMENDATION_ENABLED: 'false' });
  });
  afterAll(async () => {
    await off.close();
  });

  it('answers 503 before asking the model', async () => {
    setCaptureCoachModelForTests(() => scripted('{}'));
    await off.resetDb();
    const user = await off.createUser();

    const res = await off.app.inject({
      method: 'POST',
      url: '/capture-coach/previous-cut',
      headers: user.auth,
      payload: { image: IMAGE },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('ANALYSIS_DISABLED');
    expect(calls).toEqual([]);
  });
});
