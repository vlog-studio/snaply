import { z } from 'zod';

import type { SnsPlatform } from '@/entities/sns-connection';
import { apiPath, apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

/** Removes the link; the server drops the stored token (`DELETE /sns/{platform}/disconnect`). */
export async function disconnectSns(platform: SnsPlatform): Promise<void> {
  // Mock mode never links anything, so there is nothing to remove.
  if (USE_MOCK_API) return;
  await apiRequest(apiPath('/sns/{platform}/disconnect', { platform }), {
    method: 'DELETE',
    schema: z.unknown(),
  });
}
