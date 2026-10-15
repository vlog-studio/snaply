/**
 * 스냅 만료 예고 알림 (SNAP-13).
 *
 * 이 알림은 부가 기능이 아니다 — 유예 기간을 두지 않기로 한 결정(`EXPIRY_TO_PURGE_DAYS = 0`)이
 * 성립하려면 삭제 전에 알렸어야 하고, 그래서 **못 보낸 것을 보냈다고 기록하지 않는 것**이
 * 여기서 제일 중요한 성질이다. dry-run 이 성공으로 기록되면 운영에 서비스 계정이 빠져도
 * 배치는 "전원 발송 완료" 라고 말하면서 파일을 지운다.
 *
 * firebase-admin 은 실기기 토큰 없이 수신을 확인할 수 없으므로 `fcm.test.ts` 와 같은 방식으로
 * 대체하고, 우리 쪽 분기(선점·중복·되돌리기)만 검증한다.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const send = vi.fn();
const apps: ({ name: string } | null)[] = [];

vi.mock('firebase-admin', () => ({
  default: {
    get apps() {
      return apps;
    },
    initializeApp: (_c: unknown, name: string) => {
      const created = { name };
      apps.push(created);
      return created;
    },
    credential: { cert: (c: unknown) => c },
    messaging: () => ({ send }),
  },
}));

// 삼키던 예외를 보고하는지 본다(E-45).
const captureException = vi.fn();
vi.mock('../src/lib/sentry.js', () => ({
  initSentry: vi.fn(),
  flushSentry: vi.fn(async () => true),
  captureException,
  isSentryEnabled: () => false,
}));

const SERVICE_ACCOUNT = JSON.stringify({
  project_id: 'snaply-test',
  client_email: 'sa@snaply-test.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n',
});

const { createHarness } = await import('./helpers/harness.js');
const { initFcm } = await import('../src/services/fcm.service.js');
const { sendExpiryNotices, sendMovieExpiryNotices } = await import(
  '../src/services/expiry-notice.service.js'
);
const { MOVIE_RESULT_RETENTION_DAYS, SNAP_RETENTION_DAYS } = await import(
  '../src/services/retention-policy.js'
);
type Harness = Awaited<ReturnType<typeof createHarness>>;

let h: Harness;
const logger = { info: vi.fn(), warn: vi.fn() };

/** n 번째 발송의 알림 문구. 호출이 없으면 빈 문자열이라 단언이 그대로 실패한다. */
function sentBody(index: number): string {
  return send.mock.calls[index]?.[0]?.notification?.body ?? '';
}

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-09T01:00:00.000Z');

/** 오늘 기준 `ageDays` 일 전에 올라온 스냅. */
async function snapUploadedDaysAgo(userId: string, ageDays: number) {
  return h.prisma.video.create({
    data: {
      userId,
      kind: 'source',
      status: 'ready',
      originalUrls: [],
      createdAt: new Date(now.getTime() - ageDays * DAY_MS),
    },
    select: { id: true },
  });
}

async function userWithToken() {
  const user = await h.createUser();
  await h.prisma.user.update({ where: { id: user.id }, data: { fcmToken: 'tok-1' } });
  return user;
}

beforeAll(async () => {
  h = await createHarness({ FIREBASE_SERVICE_ACCOUNT_KEY: SERVICE_ACCOUNT });
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.resetDb();
  send.mockReset();
  captureException.mockReset();
  vi.restoreAllMocks();
  logger.info.mockReset();
  logger.warn.mockReset();
  initFcm({ projectId: 'snaply-test', serviceAccountJson: SERVICE_ACCOUNT });
});

describe('예고 대상 고르기', () => {
  it('D-3 을 지난 스냅에 예고를 보낸다', async () => {
    const user = await userWithToken();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.notified).toBe(1);
    expect(outcome.videos).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sentBody(0)).toContain('3일 후');
  });

  it('아직 D-3 이 안 된 스냅은 대상이 아니다', async () => {
    const user = await userWithToken();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 5);

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.notified).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('이미 만료된 스냅에는 보내지 않는다 — 곧 지워진다고 할 시점이 지났다', async () => {
    const user = await userWithToken();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS + 1);

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.notified).toBe(0);
  });

  it('배치가 하루 쉬어도 밀린 예고가 나간다 — "정확히 그날" 이 아니라 "지났다" 로 찾는다', async () => {
    const user = await userWithToken();
    // D-3 을 하루 넘겼다(= D-2). 그날짜 매칭이면 영영 못 받는다.
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 2);

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.notified).toBe(1);
  });

  it('이미 지워진 스냅은 대상이 아니다', async () => {
    const user = await userWithToken();
    const snap = await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);
    await h.prisma.video.update({
      where: { id: snap.id },
      data: { deletedAt: new Date(), removalReason: 'user' },
    });

    expect((await sendExpiryNotices({ logger, now, apply: true })).notified).toBe(0);
  });
});

describe('중복 발송 방지', () => {
  it('같은 스냅의 같은 예고는 두 번 보내지 않는다 — 배치가 두 번 돌아도 안전하다', async () => {
    const user = await userWithToken();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);

    await sendExpiryNotices({ logger, now, apply: true });
    const second = await sendExpiryNotices({ logger, now, apply: true });

    expect(second.notified).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('D-3 을 보냈어도 D-1 은 따로 나간다 — 예고는 두 번이다', async () => {
    const user = await userWithToken();
    const snap = await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);

    await sendExpiryNotices({ logger, now, apply: true });
    const later = new Date(now.getTime() + 2 * DAY_MS);
    const second = await sendExpiryNotices({ logger, now: later, apply: true });

    expect(second.notified).toBe(1);
    expect(sentBody(1)).toContain('내일');
    const logs = await h.prisma.notificationLog.findMany({ where: { videoId: snap.id } });
    expect(logs.map((l) => l.noticeDaysBefore).sort()).toEqual([1, 3]);
  });

  it('스냅이 여러 개여도 사용자에게는 알림 한 번 — 5개면 알림 5개가 아니다', async () => {
    const user = await userWithToken();
    for (let i = 0; i < 5; i += 1) {
      await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);
    }

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(send).toHaveBeenCalledTimes(1);
    expect(outcome.notified).toBe(1);
    expect(outcome.videos).toBe(5);
    expect(sentBody(0)).toContain('5개');
  });

  // 배치가 동시에 두 번 돌면 둘 다 같은 스냅을 찾고 둘 다 선점을 시도한다. 넣은 행 수를 보지 않아 둘 다
  // 보냈다(2026-10-14 리뷰, backlog E-45).
  it('다른 실행이 먼저 선점한 예고는 보내지 않는다', async () => {
    const user = await userWithToken();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);
    const claim = h.prisma.notificationLog.createManyAndReturn.bind(h.prisma.notificationLog);
    vi.spyOn(h.prisma.notificationLog, 'createManyAndReturn').mockImplementationOnce(((
      args: Parameters<typeof claim>[0],
    ) => claim(args).then(() => claim(args))) as never);

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.skipped.already_claimed).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });
});

// 배치가 밀리면 D-3 창의 예고가 마감 반나절 전에 "3일 후"라고 나갔고, 함께 밀린 D-1 창도 같은 날 또 갔다
// (2026-10-14 리뷰, backlog E-46).
describe('밀린 예고', () => {
  it('남은 날을 실제 마감일로 말하고, 두 창이 함께 밀리면 가까운 쪽 하나만 보낸다', async () => {
    const user = await userWithToken();
    // 오늘 밤(KST 22시) 마감 — 지금은 KST 10시다.
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 0.5);

    await sendExpiryNotices({ logger, now, apply: true });
    await sendExpiryNotices({ logger, now: new Date(now.getTime() + 60 * 60 * 1000), apply: true });

    expect(send).toHaveBeenCalledTimes(1);
    expect(sentBody(0)).toBe('오늘 스냅 1개가 삭제돼요. 앨범에 저장하거나 무비로 만들어 두세요.');
  });

  it('여러 개면 가장 이른 마감일로 말한다', async () => {
    const user = await userWithToken();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 2);

    await sendExpiryNotices({ logger, now, apply: true });

    expect(sentBody(0)).toBe('2일 후 스냅 2개가 삭제돼요. 앨범에 저장하거나 무비로 만들어 두세요.');
  });
});

describe('보내지 못한 것을 보냈다고 하지 않는다', () => {
  it('FCM 이 dry-run 이면 기록을 남기지 않는다 — 다음 실행에서 다시 시도한다', async () => {
    const user = await userWithToken();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);
    initFcm({ projectId: 'snaply-test', serviceAccountJson: '' }); // 서비스 계정 미주입

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.notified).toBe(0);
    expect(outcome.skipped.dry_run).toBe(1);
    expect(await h.prisma.notificationLog.count()).toBe(0);
  });

  it('발송이 실패하면 선점을 되돌린다', async () => {
    const user = await userWithToken();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);
    send.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'messaging/internal' }));

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.notified).toBe(0);
    expect(await h.prisma.notificationLog.count()).toBe(0);

    // 되돌렸으므로 다음 실행에서 다시 나간다.
    const retry = await sendExpiryNotices({ logger, now, apply: true });
    expect(retry.notified).toBe(1);
  });

  // 되돌리지 못하면 그 예고는 다시 가지 않는데, `.catch(() => undefined)` 가 삼켜 아무도 몰랐다(E-45).
  it('선점을 되돌리지 못하면 보고한다', async () => {
    const user = await userWithToken();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);
    send.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'messaging/internal' }));
    const lost = new Error('connection lost');
    vi.spyOn(h.prisma.notificationLog, 'deleteMany').mockRejectedValueOnce(lost);

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.notified).toBe(0);
    expect(captureException).toHaveBeenCalledWith(
      lost,
      expect.objectContaining({ phase: 'expiry-notice-release' }),
    );
  });

  it('토큰이 없으면 건너뛰고 기록도 남기지 않는다', async () => {
    const user = await h.createUser();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.skipped.no_token).toBe(1);
    expect(await h.prisma.notificationLog.count()).toBe(0);
  });

  it('알림을 끈 사용자에게는 보내지 않는다 — 화면의 남은 기간 표시가 안전망이다', async () => {
    const user = await userWithToken();
    await h.prisma.user.update({ where: { id: user.id }, data: { notificationEnabled: false } });
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.skipped.notifications_disabled).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('dry-run 실행(--yes 없이)', () => {
  it('대상만 세고 보내지도, 기록하지도 않는다', async () => {
    const user = await userWithToken();
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);

    const outcome = await sendExpiryNotices({ logger, now, apply: false });

    expect(outcome.notified).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(await h.prisma.notificationLog.count()).toBe(0);
  });
});

describe('종류별 스위치가 없다', () => {
  it('무비·위치 알림을 꺼도 만료 예고는 간다 — 끄면 모르는 채로 영상을 잃는다', async () => {
    const user = await userWithToken();
    await h.prisma.user.update({
      where: { id: user.id },
      data: { movieNotificationEnabled: false, locationNotificationEnabled: false },
    });
    await snapUploadedDaysAgo(user.id, SNAP_RETENTION_DAYS - 3);

    const outcome = await sendExpiryNotices({ logger, now, apply: true });

    expect(outcome.notified).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  // 전체 스위치를 끈 경우만 가지 않는다 — 위 '보내지 못한 것을...' 의 마지막 테스트가 고정한다.
});

describe('무비 결과물 만료 예고 (NTF-10)', () => {
  /** 결과물이 `ageDays` 일 전에 만들어진 무비. `resultStatus` 는 그 결과물 영상의 상태(기본 완성). */
  async function movieWithResultDaysAgo(
    userId: string,
    ageDays: number,
    fields: { title?: string; finishedAt?: Date; deletedAt?: Date } = {},
    resultStatus = 'done',
  ) {
    const result = await h.prisma.video.create({
      data: {
        userId,
        kind: 'result',
        status: resultStatus,
        originalUrls: [],
        createdAt: new Date(now.getTime() - ageDays * DAY_MS),
      },
      select: { id: true },
    });
    return h.prisma.movie.create({
      data: { userId, title: fields.title ?? '제주 3일', resultVideoId: result.id, ...fields },
      select: { id: true },
    });
  }

  async function movieUser() {
    const user = await userWithToken();
    await h.prisma.user.update({ where: { id: user.id }, data: { movieNotificationEnabled: true } });
    return user;
  }

  it('만료 3일 전을 지난 결과물에 그 무비를 여는 예고를 한 번 보낸다', async () => {
    const user = await movieUser();
    const movie = await movieWithResultDaysAgo(user.id, MOVIE_RESULT_RETENTION_DAYS - 3);

    const first = await sendMovieExpiryNotices({ logger, now, apply: true });
    const second = await sendMovieExpiryNotices({ logger, now, apply: true });

    expect(first.notified).toBe(1);
    expect(second.notified).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sentBody(0)).toBe("3일 후 '제주 3일' 무비가 사라져요. 남기려면 저장하거나 게시해 주세요.");
    expect(send.mock.calls[0]?.[0]?.data).toMatchObject({ kind: 'movie_expiry', movieId: movie.id });
  });

  it('아직 이르거나 이미 만료됐거나 끝낸 · 지운 무비에는 보내지 않는다', async () => {
    const user = await movieUser();
    await movieWithResultDaysAgo(user.id, MOVIE_RESULT_RETENTION_DAYS - 4);
    await movieWithResultDaysAgo(user.id, MOVIE_RESULT_RETENTION_DAYS + 1);
    await movieWithResultDaysAgo(user.id, MOVIE_RESULT_RETENTION_DAYS - 2, { finishedAt: now });
    await movieWithResultDaysAgo(user.id, MOVIE_RESULT_RETENTION_DAYS - 2, { deletedAt: now });

    const outcome = await sendMovieExpiryNotices({ logger, now, apply: true });

    expect(outcome.notified).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  // 생성을 시작하면 무비가 새 결과물 영상을 가리키고, 실패하면 그 영상은 `failed` 로 남는다. 저장할 파일이 없는데
  // "남기려면 저장하거나 게시해 주세요"가 갔다(2026-10-13 리뷰).
  it('만들지 못한 무비에는 보내지 않는다 — 남길 파일이 없다', async () => {
    const user = await movieUser();
    await movieWithResultDaysAgo(user.id, MOVIE_RESULT_RETENTION_DAYS - 2, {}, 'failed');

    const outcome = await sendMovieExpiryNotices({ logger, now, apply: true });

    expect(outcome.notified).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('같은 날 여러 편이면 한 알림으로 묶는다', async () => {
    const user = await movieUser();
    await movieWithResultDaysAgo(user.id, MOVIE_RESULT_RETENTION_DAYS - 3);
    await movieWithResultDaysAgo(user.id, MOVIE_RESULT_RETENTION_DAYS - 2, { title: '부산' });

    const outcome = await sendMovieExpiryNotices({ logger, now, apply: true });

    expect(outcome).toMatchObject({ notified: 1, movies: 2 });
    expect(sentBody(0)).toContain('무비 2편이');
  });

  it('무비 알림을 끈 사용자에게는 보내지 않는다 — 스냅 예고와 다르다', async () => {
    const user = await userWithToken();
    await h.prisma.user.update({ where: { id: user.id }, data: { movieNotificationEnabled: false } });
    await movieWithResultDaysAgo(user.id, MOVIE_RESULT_RETENTION_DAYS - 3);

    const outcome = await sendMovieExpiryNotices({ logger, now, apply: true });

    expect(outcome.skipped).toEqual({ notifications_disabled: 1 });
    expect(send).not.toHaveBeenCalled();
  });

  it('발송이 실패하면 선점을 되돌려 다음 실행에서 다시 보낸다', async () => {
    const user = await movieUser();
    await movieWithResultDaysAgo(user.id, MOVIE_RESULT_RETENTION_DAYS - 3);
    send.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'messaging/internal' }));

    const failed = await sendMovieExpiryNotices({ logger, now, apply: true });
    const retried = await sendMovieExpiryNotices({ logger, now, apply: true });

    expect(failed.notified).toBe(0);
    expect(retried.notified).toBe(1);
  });

  it.each([
    [MOVIE_RESULT_RETENTION_DAYS - 0.5, '오늘'],
    [MOVIE_RESULT_RETENTION_DAYS - 1, '내일'],
  ])('밀린 예고는 실제 마감일로 말한다 — 결과물이 %s일 전이면 "%s"', async (ageDays, when) => {
    const user = await movieUser();
    await movieWithResultDaysAgo(user.id, ageDays);

    await sendMovieExpiryNotices({ logger, now, apply: true });

    expect(sentBody(0)).toBe(`${when} '제주 3일' 무비가 사라져요. 남기려면 저장하거나 게시해 주세요.`);
  });
});
