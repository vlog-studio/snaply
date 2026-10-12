import { z } from 'zod';

/** The server's limit (`patchMeBodySchema.nickname`). */
export const NicknameMaxLength = 50;

/**
 * What the nickname sheet accepts: 1–50 characters once trimmed. Unlike a movie
 * name there is no blank fallback to fall to — the server takes no empty
 * nickname — so a blank field is refused in the user's words. The length rule
 * is checked here as well as capped on the input, because a paste arrives past
 * the cap without ever being typed.
 */
export const nicknameSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(1, '이름을 입력해 주세요.')
    .max(NicknameMaxLength, `${NicknameMaxLength}자까지 쓸 수 있어요.`),
});

export type NicknameValues = z.infer<typeof nicknameSchema>;
