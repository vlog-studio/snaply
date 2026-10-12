import { z } from 'zod';

/** The one field this feature reads off `GET /auth/me` · `PATCH /auth/me`. */
export const nicknameDtoSchema = z.object({ nickname: z.string().nullable() });

/** A nickname never set reads as none; a blank one could only come from an older write. */
export function mapNickname(dto: z.infer<typeof nicknameDtoSchema>): string | null {
  const nickname = dto.nickname?.trim();
  return nickname ? nickname : null;
}
