import type { InterestTopic } from '../model/interest-topic';

/** Mock mode keeps the choice in memory, the way the server would keep it. */
let stored: string[] = [];

const TOPICS: InterestTopic[] = [
  { id: 'walk', label: '산책' },
  { id: 'cafe', label: '카페' },
  { id: 'travel', label: '여행' },
  { id: 'food_spot', label: '맛집' },
  { id: 'daily_life', label: '일상' },
];

export function mockReadInterests(): Promise<string[]> {
  return Promise.resolve(stored);
}

export function mockUpdateInterests(interests: string[]): Promise<string[]> {
  stored = interests;
  return Promise.resolve(stored);
}

export function mockReadInterestTopics(): Promise<InterestTopic[]> {
  return Promise.resolve(TOPICS);
}
