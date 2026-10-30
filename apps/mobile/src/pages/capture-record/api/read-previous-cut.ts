import { File } from 'expo-file-system';
import { z } from 'zod';

import { apiRequest } from '@/shared/api';

/** The wire shape of `POST /capture-coach/previous-cut` (SNAP-25). */
const previousCutReadDtoSchema = z.object({
  scene: z.string(),
  subject: z.object({ cx: z.number(), cy: z.number(), size: z.number() }).nullable(),
  advice: z.string(),
  model: z.string(),
});

/** Where the previous cut's subject sits, as shares of its frame (left/top 0) and of its width. */
export type CutSubject = { cx: number; cy: number; size: number };

/** What the AI made of the previous cut's closing frame. */
export type PreviousCutRead = {
  /** One line on how to continue, shown as is. */
  advice: string;
  subject: CutSubject | null;
};

/**
 * Sends the previous cut's closing frame — the thumbnail already extracted for
 * the ghost, never the video — to be read once. Nothing is stored server-side.
 */
export async function readPreviousCut(
  frameUri: string,
  signal?: AbortSignal,
): Promise<PreviousCutRead> {
  const image = await new File(frameUri).base64();
  const dto = await apiRequest('/capture-coach/previous-cut', {
    method: 'POST',
    body: { image },
    schema: previousCutReadDtoSchema,
    signal,
  });
  return { advice: dto.advice, subject: dto.subject };
}
