/**
 * Where the backend sends the browser back to once the platform has answered:
 * `snaplyapp://sns/connected?platform=…` or `snaplyapp://sns/error?platform=…&reason=…`
 * (`apps/api/src/services/sns.service.ts`). The scheme is fixed by the server,
 * not by how this build was launched, so it is not derived from `expo-linking`.
 */
export const SnsReturnUrl = 'snaplyapp://sns';

/** What the browser's return URL says about the attempt. */
export type ConnectResult =
  | { kind: 'connected' }
  /** The platform refused a personal account (SNS-2) — the one reason the user can act on. */
  | { kind: 'personal-account' }
  | { kind: 'failed' };

/**
 * Reads the return URL. Anything this build does not recognise is a plain
 * failure: the server's reason codes are diagnostics, and only the personal
 * account has a fix the user can make.
 */
export function readConnectResult(url: string): ConnectResult {
  const path = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split('?')[0] ?? '';
  if (path === 'sns/connected') return { kind: 'connected' };
  const reason = /[?&]reason=([^&#]*)/.exec(url)?.[1];
  if (path === 'sns/error' && reason === 'account_type') return { kind: 'personal-account' };
  return { kind: 'failed' };
}
