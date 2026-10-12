import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import { mockReadNickname, mockUpdateNickname } from './mock-nickname';
import { mapNickname, nicknameDtoSchema } from './nickname.dto';

/** The account's nickname as the server holds it (`GET /auth/me`); `null` when never set. */
export async function getNickname(signal?: AbortSignal): Promise<string | null> {
  if (USE_MOCK_API) return mockReadNickname();
  const dto = await apiRequest('/auth/me', { method: 'GET', schema: nicknameDtoSchema, signal });
  return mapNickname(dto);
}

/** Writes the nickname (`PATCH /auth/me`) and returns what the server now holds. */
export async function updateNickname(nickname: string): Promise<string | null> {
  if (USE_MOCK_API) return mockUpdateNickname(nickname);
  const dto = await apiRequest('/auth/me', {
    method: 'PATCH',
    body: { nickname },
    schema: nicknameDtoSchema,
  });
  return mapNickname(dto);
}
