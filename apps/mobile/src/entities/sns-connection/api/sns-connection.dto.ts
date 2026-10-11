import { z } from 'zod';

import type { SnsConnection, SnsPlatform } from '../model/sns-connection';

/**
 * The wire shape of `GET /sns/connections`. `platform` stays a string: a
 * platform the server adds later must not fail the whole read — the mapper
 * drops what this build cannot act on.
 */
export const snsConnectionDtoSchema = z.object({
  platform: z.string(),
  platformUsername: z.string().nullable(),
  connectedAt: z.string(),
  tokenExpiresAt: z.string().nullable(),
});
export type SnsConnectionDto = z.infer<typeof snsConnectionDtoSchema>;
export const snsConnectionsDtoSchema = z.array(snsConnectionDtoSchema);

const KnownPlatforms: readonly SnsPlatform[] = ['instagram', 'tiktok'];

export function mapSnsConnections(dtos: SnsConnectionDto[]): SnsConnection[] {
  return dtos.flatMap((dto) => {
    const platform = KnownPlatforms.find((known) => known === dto.platform);
    if (!platform) return [];
    return [
      {
        platform,
        username: dto.platformUsername,
        connectedAt: new Date(dto.connectedAt),
        tokenExpiresAt: dto.tokenExpiresAt === null ? null : new Date(dto.tokenExpiresAt),
      },
    ];
  });
}
