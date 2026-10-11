import { z } from 'zod';

import { apiPath, apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

/**
 * The wire answer of `POST /sns/instagram/upload`. `status` stays a string:
 * a status the server adds later must not fail a post that went through.
 */
const snsUploadDtoSchema = z.object({ status: z.string() });

/** How a post ended, as this app acts on it. */
export type PostOutcome = 'posted' | 'processing';

/**
 * Posts the finished movie's file as a Reel (`POST /sns/instagram/upload`). The
 * server waits for Instagram to finish processing, so this can take tens of
 * seconds; a post that went through also finishes the movie on the server
 * (MOV-17).
 */
export async function postMovieToInstagram(params: {
  videoId: string;
  caption?: string;
}): Promise<PostOutcome> {
  // Mock mode has no account to post to; the attempt ends as a plain failure.
  if (USE_MOCK_API) throw new Error('No Instagram account in mock mode.');
  const dto = await apiRequest(apiPath('/sns/{platform}/upload', { platform: 'instagram' }), {
    method: 'POST',
    body: { videoId: params.videoId, ...(params.caption ? { caption: params.caption } : null) },
    schema: snsUploadDtoSchema,
  });
  // Instagram either published it or is still processing; anything else would
  // have come back as an error, which the caller reads as a failure.
  return dto.status === 'success' ? 'posted' : 'processing';
}
