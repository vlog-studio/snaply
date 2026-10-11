/** The social platforms the backend can link an account to. */
export type SnsPlatform = 'instagram' | 'tiktok';

/** One linked social account, as this app acts on it. */
export type SnsConnection = {
  platform: SnsPlatform;
  /** The account's handle, when the platform told the server one. */
  username: string | null;
  connectedAt: Date;
  /**
   * When the platform's access stops working. `null` is "unknown", not "never":
   * such a link can lapse silently and a post then fails on the platform's side.
   */
  tokenExpiresAt: Date | null;
};

/**
 * Whether the link must be made again before posting: its access has run out,
 * or nobody knows when it does (the contract's own reading of a `null` expiry).
 */
export function needsReconnect(connection: SnsConnection, now: number): boolean {
  return connection.tokenExpiresAt === null || connection.tokenExpiresAt.getTime() <= now;
}
