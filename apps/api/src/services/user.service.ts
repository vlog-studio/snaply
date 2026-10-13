import type { UserProfile } from '@vlog-studio/shared-types';
import { Prisma } from '@prisma/client';
import { getPrisma } from '../db/client.js';
import { captureException } from '../lib/sentry.js';
import { grantSignupBonus } from './credit.service.js';
import { knownInterests, requireKnownInterests, syncInterestTastes } from './interest.service.js';
import { readTasteProfile } from './taste/taste.service.js';
import { buildTasteLookup, recommendedStyle } from './taste/taste-affinity.js';

const UNIQUE_VIOLATION = 'P2002';

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION;
}

const USER_SELECT = { id: true, supabaseUid: true, deletedAt: true } as const;

/** 미들웨어에서 request.user에 담는 최소 정보 */
export interface AuthUser {
  id: string;
  supabaseUid: string;
  /** 계정 삭제 요청 시각. 유예 기간 중이면 값이 있고, 인증 미들웨어가 접근을 차단한다. */
  deletedAt: Date | null;
}

/**
 * Supabase UID로 앱 유저를 조회하고, 없으면 생성한다(첫 로그인 처리).
 * update: {} 이므로 삭제 대기(deletedAt) 상태를 되살리지 않는다 — 복구는 restoreAccount 로만.
 *
 * 플랜 개념은 없다 — 정기 구독을 제품 모델에서 제거했다
 * (docs/decisions/credit-payment-model.md).
 */
export async function resolveUser(supabaseUid: string): Promise<AuthUser> {
  const user = await upsertUser(supabaseUid);

  // 가입 보너스는 지급 여부를 원장으로 판정하므로 여기서 매번 호출해도 한 번만 들어간다.
  // 지급 실패가 로그인을 막아서는 안 된다 — 보고만 하고 통과시킨다.
  await grantSignupBonus(user.id).catch((err: unknown) => {
    captureException(err, { userId: user.id, at: 'grantSignupBonus' });
  });

  return {
    id: user.id,
    supabaseUid: user.supabaseUid,
    deletedAt: user.deletedAt,
  };
}

/**
 * Prisma 의 upsert 는 원자적이지 않다(findUnique → create). 첫 로그인 직후 앱은 요청 여러 개를
 * 동시에 보내므로, 같은 supabase_uid 의 create 가 경합해 한쪽이 P2002 로 실패한다 — 실제로
 * 첫 로그인의 /movies 가 500 을 받았다(2026-09-23 시뮬레이터 검증). 유니크 위반은 "누군가
 * 먼저 만들었다"는 뜻이므로 그 행을 다시 읽어 돌려준다.
 */
async function upsertUser(supabaseUid: string): Promise<AuthUser> {
  const prisma = getPrisma();
  try {
    return await prisma.user.upsert({
      where: { supabaseUid },
      update: {},
      create: { supabaseUid },
      select: USER_SELECT,
    });
  } catch (err) {
    if (!isUniqueViolation(err)) {
      throw err;
    }
    const existing = await prisma.user.findUnique({ where: { supabaseUid }, select: USER_SELECT });
    if (!existing) {
      throw err;
    }
    return existing;
  }
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nickname: true,
      avatarUrl: true,
      interests: true,
      notificationEnabled: true,
      locationNotificationEnabled: true,
      movieNotificationEnabled: true,
      quietStart: true,
      quietEnd: true,
    },
  });

  if (!user) {
    return null;
  }
  const taste = buildTasteLookup(await readTasteProfile(userId));

  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    interests: knownInterests(user.interests),
    notificationEnabled: user.notificationEnabled,
    locationNotificationEnabled: user.locationNotificationEnabled,
    movieNotificationEnabled: user.movieNotificationEnabled,
    quietStart: user.quietStart,
    quietEnd: user.quietEnd,
    recommendedStyle: recommendedStyle(taste),
  };
}

export interface ProfileUpdate {
  nickname?: string;
  avatarUrl?: string | null;
  interests?: string[];
  notificationEnabled?: boolean;
  locationNotificationEnabled?: boolean;
  movieNotificationEnabled?: boolean;
  quietStart?: number;
  quietEnd?: number;
}

export async function updateProfile(userId: string, patch: ProfileUpdate): Promise<UserProfile> {
  // 관심사는 개념 사전의 주제만 받고(ACC-5), 취향 프로필의 관심사 행을 같은 트랜잭션에서 맞춘다(PRF-1 · PRF-4).
  const interests = patch.interests !== undefined ? requireKnownInterests(patch.interests) : undefined;
  await getPrisma().$transaction(async (tx) => {
    await updateUserRow(tx, userId, patch, interests);
    if (interests !== undefined) await syncInterestTastes(tx, userId, interests);
  });

  // update 직후 항상 존재하므로 non-null 단언 대신 재조회 결과를 그대로 반환
  return (await getProfile(userId))!;
}

async function updateUserRow(
  tx: Prisma.TransactionClient,
  userId: string,
  patch: ProfileUpdate,
  interests: string[] | undefined,
): Promise<void> {
  await tx.user.update({
    where: { id: userId },
    data: {
      ...(patch.nickname !== undefined ? { nickname: patch.nickname } : {}),
      ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
      ...(interests !== undefined ? { interests } : {}),
      ...(patch.notificationEnabled !== undefined
        ? { notificationEnabled: patch.notificationEnabled }
        : {}),
      ...(patch.locationNotificationEnabled !== undefined
        ? { locationNotificationEnabled: patch.locationNotificationEnabled }
        : {}),
      ...(patch.movieNotificationEnabled !== undefined
        ? { movieNotificationEnabled: patch.movieNotificationEnabled }
        : {}),
      ...(patch.quietStart !== undefined ? { quietStart: patch.quietStart } : {}),
      ...(patch.quietEnd !== undefined ? { quietEnd: patch.quietEnd } : {}),
    },
  });
}

/**
 * 기기 교체를 고려해 항상 덮어쓴다(upsert 성격). 같은 토큰을 가진 다른 계정에서는 지운다 —
 * 토큰은 기기 하나를 가리키므로, 한 기기에서 계정을 바꾸면 이전 계정의 알림(무비 제목이 든
 * 완성 알림 등)이 지금 다른 계정으로 로그인한 그 기기로 가게 된다(backlog E-28).
 */
export async function updateFcmToken(userId: string, fcmToken: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.user.updateMany({
      where: { fcmToken, id: { not: userId } },
      data: { fcmToken: null },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { fcmToken },
    }),
  ]);
}
