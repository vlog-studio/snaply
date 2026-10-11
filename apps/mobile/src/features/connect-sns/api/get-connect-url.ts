import { z } from 'zod';

import type { SnsPlatform } from '@/entities/sns-connection';
import { apiPath, apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

const authorizeUrlDtoSchema = z.object({ authorizeUrl: z.string() });

/**
 * Where to send the user to approve the link (`GET /sns/{platform}/connect`). The
 * URL carries a short-lived, signed `state` naming this account, so it is asked
 * for right before opening the browser rather than kept.
 */
export async function getConnectUrl(platform: SnsPlatform): Promise<string> {
  // Mock mode has no platform to approve on; the attempt ends as a plain failure.
  if (USE_MOCK_API) throw new Error('No social platform in mock mode.');
  const dto = await apiRequest(apiPath('/sns/{platform}/connect', { platform }), {
    method: 'GET',
    schema: authorizeUrlDtoSchema,
  });
  return dto.authorizeUrl;
}
