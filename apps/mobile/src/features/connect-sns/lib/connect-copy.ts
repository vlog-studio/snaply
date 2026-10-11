import type { SnsPlatform } from '@/entities/sns-connection';

/** The platform as the screen names it — brand names stay in English. */
export const SnsPlatformNames: Record<SnsPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

/** Why linking did not take, in the user's words. */
export const ConnectMessages = {
  personalAccount: (name: string) =>
    `프로페셔널 계정만 연결할 수 있어요. ${name}에서 계정 유형을 바꾼 뒤 다시 연결해 주세요.`,
  failed: (name: string) => `${name}에 연결하지 못했어요. 다시 시도해 주세요.`,
  disconnectFailed: (name: string) => `${name} 연결을 해제하지 못했어요. 다시 시도해 주세요.`,
};
