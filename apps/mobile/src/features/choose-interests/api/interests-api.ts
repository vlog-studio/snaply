import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { InterestTopic } from '../model/interest-topic';
import { mockReadInterests, mockReadInterestTopics, mockUpdateInterests } from './mock-interests';
import { chosenInterestsDtoSchema, interestTopicsDtoSchema } from './interests.dto';

/** The account's chosen interests (`GET /auth/me`), as topic ids. */
export async function getChosenInterests(signal?: AbortSignal): Promise<string[]> {
  if (USE_MOCK_API) return mockReadInterests();
  const dto = await apiRequest('/auth/me', {
    method: 'GET',
    schema: chosenInterestsDtoSchema,
    signal,
  });
  return dto.interests;
}

/** Replaces the chosen interests (`PATCH /auth/me`) and returns what the server now holds. */
export async function updateInterests(interests: string[]): Promise<string[]> {
  if (USE_MOCK_API) return mockUpdateInterests(interests);
  const dto = await apiRequest('/auth/me', {
    method: 'PATCH',
    body: { interests },
    schema: chosenInterestsDtoSchema,
  });
  return dto.interests;
}

/** The topics a user can choose (`GET /interest-topics`). */
export async function getInterestTopics(signal?: AbortSignal): Promise<InterestTopic[]> {
  if (USE_MOCK_API) return mockReadInterestTopics();
  const dto = await apiRequest('/interest-topics', {
    method: 'GET',
    schema: interestTopicsDtoSchema,
    signal,
  });
  return dto.topics;
}
