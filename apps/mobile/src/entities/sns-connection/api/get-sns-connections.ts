import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { SnsConnection } from '../model/sns-connection';

import { mapSnsConnections, snsConnectionsDtoSchema } from './sns-connection.dto';

/** The account's linked social accounts (`GET /sns/connections`). */
export async function getSnsConnections(signal?: AbortSignal): Promise<SnsConnection[]> {
  // Mock mode links nothing: there is no platform to send anyone to.
  if (USE_MOCK_API) return [];
  const dtos = await apiRequest('/sns/connections', {
    method: 'GET',
    schema: snsConnectionsDtoSchema,
    signal,
  });
  return mapSnsConnections(dtos);
}
