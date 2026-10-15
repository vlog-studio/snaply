/**
 * 스냅 만료 예고 알림 (SNAP-13).
 *
 * 유예 기간을 두지 않기로 한 결정(`EXPIRY_TO_PURGE_DAYS = 0`)이 성립하려면 **삭제 전에
 * 알렸어야 한다.** 그래서 이 모듈은 부가 기능이 아니라 삭제 정책의 나머지 절반이다.
 *
 * 세 가지를 지킨다.
 *
 * - **두 번 보내지 않는다.** 발송 전에 `notification_logs` 행을 선점하고, 실패하면 지운다.
 *   유니크 제약이 DB 수준에서 막고, **이번 실행이 넣은 행만** 보내므로 배치가 동시에 두 번 돌아도
 *   중복되지 않는다(backlog E-45).
 * - **밀린 예고도 보낸다.** "정확히 D-3 인 스냅" 이 아니라 "D-3 을 지났는데 아직 안 보낸
 *   스냅" 을 찾는다. 배치가 하루 쉬어도 예고가 통째로 증발하지 않는다. 두 창이 함께 밀렸으면 가까운
 *   창(D-1)만 보낸다 — 같은 날 예고 두 개가 가지 않게, 가까운 창의 기록이 먼 창도 덮는다. 문구의 남은
 *   날은 창이 아니라 실제 마감일까지 달력의 날짜로 센다(backlog E-46).
 * - **못 보낸 것을 보냈다고 하지 않는다.** FCM dry-run(운영에 서비스 계정 미주입)은
 *   `sendToUser` 가 성공으로 돌려주지만, 여기서는 선점을 되돌려 다음 실행에서 다시 시도한다.
 */
import type { Prisma } from '@prisma/client';
import { getPrisma } from '../db/client.js';
import { captureException } from '../lib/sentry.js';
import { isFcmDryRun, sendToUser } from './fcm.service.js';
import {
  MOVIE_EXPIRY_NOTICE_DAYS,
  MOVIE_RESULT_RETENTION_DAYS,
  SNAP_EXPIRY_NOTICE_DAYS,
  SNAP_RETENTION_DAYS,
  cutoffFor,
  kstCalendarDaysUntil,
  movieResultExpiresAt,
  snapExpiresAt,
} from './retention-policy.js';

interface Logger {
  info: (o: object, m?: string) => void;
  warn: (o: object, m?: string) => void;
}

export interface NoticeOutcome {
  /** 알림을 보낸 사용자 수 */
  notified: number;
  /** 예고한 스냅 수 */
  videos: number;
  /** 보내지 않은 이유별 사용자 수 */
  skipped: Record<string, number>;
}

/**
 * 예고 대상: 아직 살아 있고, D-`daysBefore` 를 지났고, 그 예고를 — 또는 더 가까운 예고를 — 아직 못 받은 스냅.
 * 더 가까운 예고를 받았으면 이 예고는 늦었다(두 창이 함께 밀린 날 가까운 쪽만 간다).
 */
async function findDueSnaps(daysBefore: number, now: Date) {
  return await getPrisma().video.findMany({
    where: {
      kind: 'source',
      status: 'ready',
      deletedAt: null,
      createdAt: {
        // D-`daysBefore` 를 지났다 — "정확히 그날" 이 아니라 "지났다" 이므로, 배치가 하루
        // 쉬어도 밀린 예고가 걸린다.
        lte: cutoffFor(SNAP_RETENTION_DAYS - daysBefore, now),
        // 아직 만료되지는 않았다. 오늘 지워질 것에 "곧 지워집니다" 를 보내지 않는다.
        gt: cutoffFor(SNAP_RETENTION_DAYS, now),
      },
      notificationLogs: { none: { noticeDaysBefore: { lte: daysBefore } } },
    },
    select: { id: true, userId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * 사용자가 이 알림을 받을 수 있는 상태인가.
 *
 * **조용한 시간대는 여기서 보지 않는다.** 배치를 낮에 돌려 애초에 그 구간을 피하기
 * 때문이다(`EXPIRY_NOTICE_HOUR_KST`). 시간으로 거르면 걸린 알림이 그냥 사라지는데,
 * 만료 예고는 사라지면 사용자가 파일을 잃는다.
 *
 * **이 알림에는 종류별 스위치가 없다.** 끌 수 있게 하면 사용자가 모르는 채로 영상을 잃는데,
 * 만료에 유예가 없는 근거가 "미리 알린다" 였다(docs/decisions/notification-preferences.md).
 * 푸시 전체를 끈 사용자에게만 가지 않으며, 그때는 라이브러리 화면의 남은 기간 표시(SNAP-13)가
 * 유일한 안내다.
 */
async function canNotify(userId: string): Promise<boolean> {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { notificationEnabled: true, deletedAt: true },
  });
  return Boolean(user && user.notificationEnabled && !user.deletedAt);
}

/** 마감일까지 남은 날 — 달력의 날짜(KST)로 센다. 앱의 남은 기간 표시(SNAP-13)와 같은 셈이다. */
function whenPhrase(deadline: Date, now: Date): string {
  const days = kstCalendarDaysUntil(deadline, now);
  if (days <= 0) return '오늘';
  return days === 1 ? '내일' : `${days}일 후`;
}

function messageFor(when: string, count: number): { title: string; body: string } {
  return {
    title: '스냅 보관 기간이 곧 끝나요',
    // 되돌릴 수 없다는 것과, 지금 무엇을 하면 되는지를 같이 말한다. 탭하면 앱이 그 스냅들을 앨범 저장용으로
    // 골라 둔 채 라이브러리를 연다(SNAP-13).
    body: `${when} 스냅 ${count}개가 삭제돼요. 앨범에 저장하거나 무비로 만들어 두세요.`,
  };
}

/**
 * 만료 예고를 발송한다. `apply` 가 false 면 대상만 세고 보내지 않는다(dry-run).
 *
 * 사용자당 한 번만 보낸다 — 스냅 5개가 같은 날 만료된다고 알림 5개를 보내면 사용자는
 * 알림을 끈다. 기록은 스냅별로 남겨 다음 실행이 같은 스냅을 다시 세지 않게 한다.
 */
export async function sendExpiryNotices(params: {
  logger: Logger;
  now?: Date;
  apply?: boolean;
}): Promise<NoticeOutcome> {
  const now = params.now ?? new Date();
  const apply = params.apply ?? false;
  const prisma = getPrisma();
  const outcome: NoticeOutcome = { notified: 0, videos: 0, skipped: {} };
  const skip = (reason: string): void => {
    outcome.skipped[reason] = (outcome.skipped[reason] ?? 0) + 1;
  };

  // 가까운 창부터 — 그 기록이 같은 날 밀린 먼 창을 덮는다(`findDueSnaps`).
  for (const daysBefore of [...SNAP_EXPIRY_NOTICE_DAYS].sort((a, b) => a - b)) {
    const due = await findDueSnaps(daysBefore, now);
    const byUser = new Map<string, typeof due>();
    for (const video of due) {
      byUser.set(video.userId, [...(byUser.get(video.userId) ?? []), video]);
    }

    for (const [userId, videos] of byUser) {
      const videoIds = videos.map((video) => video.id);
      if (!(await canNotify(userId))) {
        skip('notifications_disabled');
        continue;
      }
      if (!apply) {
        outcome.notified += 1;
        outcome.videos += videoIds.length;
        continue;
      }

      // 발송보다 먼저 선점한다. 이번 실행이 넣은 행만 보낸다 — 이미 있던 행은 다른 실행이 보내는 중이다.
      let claimed: string[];
      try {
        const rows = await prisma.notificationLog.createManyAndReturn({
          data: videoIds.map((videoId) => ({
            userId,
            kind: 'snap_expiry' as const,
            videoId,
            noticeDaysBefore: daysBefore,
          })),
          skipDuplicates: true,
          select: { videoId: true },
        });
        claimed = rows.flatMap((row) => (row.videoId ? [row.videoId] : []));
      } catch (err) {
        captureException(err, { userId, daysBefore, phase: 'expiry-notice-claim' });
        skip('claim_failed');
        continue;
      }
      if (claimed.length === 0) {
        skip('already_claimed');
        continue;
      }
      // 여러 개면 가장 이른 마감일로 말한다 — 늦게 말하면 그 스냅을 잃는다.
      const earliest = Math.min(
        ...videos.filter((video) => claimed.includes(video.id)).map((video) => snapExpiresAt(video.createdAt).getTime()),
      );

      const result = await sendToUser(params.logger, userId, {
        ...messageFor(whenPhrase(new Date(earliest), now), claimed.length),
        data: { kind: 'snap_expiry', daysBefore: String(daysBefore) },
      });

      // dry-run 은 보낸 것이 아니다. 성공으로 기록하면 운영 설정 누락이 초록불로 보인다.
      const delivered = result.sent && !result.dryRun;
      if (!delivered) {
        await releaseClaim(
          { userId, noticeDaysBefore: daysBefore, videoId: { in: claimed } },
          { userId, daysBefore, phase: 'expiry-notice-release' },
        );
        skip(result.sent ? 'dry_run' : result.reason);
        continue;
      }

      outcome.notified += 1;
      outcome.videos += claimed.length;
    }
  }

  if (apply && isFcmDryRun()) {
    params.logger.warn(
      { skipped: outcome.skipped },
      'FCM 이 dry-run 이라 만료 예고가 실제로 발송되지 않았다 — 서비스 계정을 확인할 것',
    );
  }
  return outcome;
}

// ── 무비 결과물 만료 예고 (NTF-10) ─────────────────────────────

export interface MovieNoticeOutcome {
  /** 알림을 보낸 사용자 수 */
  notified: number;
  /** 예고한 무비 수 */
  movies: number;
  /** 보내지 않은 이유별 사용자 수 */
  skipped: Record<string, number>;
}

/**
 * 예고 대상: 끝내지 않았고(MOV-17), 결과물이 완성돼 아직 살아 있고, D-`daysBefore` 를 지났고, 그 예고를 아직 못 받은 무비.
 * 결과물의 기준 시각은 정리 배치와 같은 `resultVideo.createdAt` 이다(`findExpiredMovieResults`).
 * 생성을 시작하면 무비가 새 결과물 영상을 가리키고 실패하면 그 영상은 `failed` 로 남으므로, 완성(`done`)만 고른다 —
 * 남길 파일이 없는 무비에 "저장하거나 게시해 주세요"를 보내지 않는다.
 */
async function findDueMovies(daysBefore: number, now: Date) {
  return await getPrisma().movie.findMany({
    where: {
      deletedAt: null,
      finishedAt: null,
      resultVideo: {
        deletedAt: null,
        status: 'done',
        createdAt: {
          lte: cutoffFor(MOVIE_RESULT_RETENTION_DAYS - daysBefore, now),
          gt: cutoffFor(MOVIE_RESULT_RETENTION_DAYS, now),
        },
        notificationLogs: { none: { kind: 'movie_expiry', noticeDaysBefore: daysBefore } },
      },
    },
    select: {
      id: true,
      userId: true,
      title: true,
      resultVideoId: true,
      resultVideo: { select: { createdAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * 무비 예고는 **무비 알림 스위치를 따른다**(스냅 예고와 다르다, NTF-10). 무비는 지워져도 컷 구성이 남아
 * 다시 만들 수 있고, 감상 화면이 남은 기간을 늘 보여 주기 때문이다.
 */
async function canNotifyMovie(userId: string): Promise<boolean> {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { notificationEnabled: true, movieNotificationEnabled: true, deletedAt: true },
  });
  return Boolean(
    user && user.notificationEnabled && user.movieNotificationEnabled && !user.deletedAt,
  );
}

function movieMessageFor(when: string, titles: string[]): { title: string; body: string } {
  const what = titles.length === 1 ? `'${titles[0]}' 무비가` : `무비 ${titles.length}편이`;
  return {
    title: '무비 보관 기간이 곧 끝나요',
    body: `${when} ${what} 사라져요. 남기려면 저장하거나 게시해 주세요.`,
  };
}

/**
 * 무비 결과물 만료 예고를 발송한다. `apply` 가 false 면 대상만 센다(dry-run).
 * 선점 · 되돌리기 · 사용자당 한 알림은 스냅 예고(`sendExpiryNotices`)와 같다.
 */
export async function sendMovieExpiryNotices(params: {
  logger: Logger;
  now?: Date;
  apply?: boolean;
}): Promise<MovieNoticeOutcome> {
  const now = params.now ?? new Date();
  const apply = params.apply ?? false;
  const prisma = getPrisma();
  const outcome: MovieNoticeOutcome = { notified: 0, movies: 0, skipped: {} };
  const skip = (reason: string): void => {
    outcome.skipped[reason] = (outcome.skipped[reason] ?? 0) + 1;
  };

  for (const daysBefore of MOVIE_EXPIRY_NOTICE_DAYS) {
    const due = await findDueMovies(daysBefore, now);
    const byUser = new Map<string, typeof due>();
    for (const movie of due) {
      byUser.set(movie.userId, [...(byUser.get(movie.userId) ?? []), movie]);
    }

    for (const [userId, movies] of byUser) {
      if (!(await canNotifyMovie(userId))) {
        skip('notifications_disabled');
        continue;
      }
      if (!apply) {
        outcome.notified += 1;
        outcome.movies += movies.length;
        continue;
      }

      const videoIds = movies.flatMap((movie) => (movie.resultVideoId ? [movie.resultVideoId] : []));
      let claimed: typeof movies;
      try {
        const rows = await prisma.notificationLog.createManyAndReturn({
          data: videoIds.map((videoId) => ({
            userId,
            kind: 'movie_expiry' as const,
            videoId,
            noticeDaysBefore: daysBefore,
          })),
          skipDuplicates: true,
          select: { videoId: true },
        });
        const claimedIds = new Set(rows.map((row) => row.videoId));
        claimed = movies.filter((movie) => movie.resultVideoId && claimedIds.has(movie.resultVideoId));
      } catch (err) {
        captureException(err, { userId, daysBefore, phase: 'movie-expiry-notice-claim' });
        skip('claim_failed');
        continue;
      }
      if (claimed.length === 0) {
        skip('already_claimed');
        continue;
      }
      const earliest = Math.min(
        ...claimed.map((movie) => movieResultExpiresAt(movie.resultVideo!.createdAt).getTime()),
      );

      const result = await sendToUser(params.logger, userId, {
        ...movieMessageFor(
          whenPhrase(new Date(earliest), now),
          claimed.map((movie) => movie.title),
        ),
        // 한 편이면 그 무비를 연다. 여러 편이면 앱만 연다 — 어느 하나를 고를 근거가 없다.
        data:
          claimed.length === 1
            ? { kind: 'movie_expiry', movieId: claimed[0]!.id, daysBefore: String(daysBefore) }
            : { kind: 'movie_expiry', daysBefore: String(daysBefore) },
      });

      const delivered = result.sent && !result.dryRun;
      if (!delivered) {
        await releaseClaim(
          {
            userId,
            kind: 'movie_expiry',
            noticeDaysBefore: daysBefore,
            videoId: { in: claimed.flatMap((movie) => (movie.resultVideoId ? [movie.resultVideoId] : [])) },
          },
          { userId, daysBefore, phase: 'movie-expiry-notice-release' },
        );
        skip(result.sent ? 'dry_run' : result.reason);
        continue;
      }

      outcome.notified += 1;
      outcome.movies += claimed.length;
    }
  }
  return outcome;
}

/**
 * 보내지 못한 예고의 선점을 되돌린다. 되돌리지 못하면 그 예고는 다시 가지 않으므로 삼키지 않고 보고한다
 * (backlog E-45) — 배치는 다음 사용자로 넘어간다.
 */
async function releaseClaim(
  where: Prisma.NotificationLogWhereInput,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    await getPrisma().notificationLog.deleteMany({ where });
  } catch (err) {
    captureException(err, context);
  }
}
