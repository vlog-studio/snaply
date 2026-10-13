import { fireEvent, render, screen } from '@testing-library/react-native';

import { MeInterestsPage } from './me-interests-page';

const mockToggle = jest.fn();
const mockRetry = jest.fn();
let mockChosen: string[] | undefined = ['cafe'];
let mockTopics: Array<{ id: string; label: string }> | undefined = [
  { id: 'cafe', label: '카페' },
  { id: 'travel', label: '여행' },
];
let mockLoadFailed = false;
let mockSaveFailed = false;

jest.mock('@/features/choose-interests', () => ({
  useChosenInterests: () => mockChosen,
  useInterestTopics: () => ({ topics: mockTopics, failed: mockLoadFailed, retry: mockRetry }),
  useToggleInterest: () => ({ toggle: mockToggle, failed: mockSaveFailed }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockChosen = ['cafe'];
  mockTopics = [
    { id: 'cafe', label: '카페' },
    { id: 'travel', label: '여행' },
  ];
  mockLoadFailed = false;
  mockSaveFailed = false;
});

describe('MeInterestsPage', () => {
  it('shows every topic as a checkbox, the chosen ones checked, under the count', async () => {
    await render(<MeInterestsPage />);

    expect(screen.getByText('1개 골랐어요')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: '카페' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '여행' })).not.toBeChecked();
  });

  it('toggles a topic with one tap — the tap is the commit', async () => {
    await render(<MeInterestsPage />);

    await fireEvent.press(screen.getByRole('checkbox', { name: '여행' }));

    expect(mockToggle).toHaveBeenCalledWith('travel');
  });

  it('says none is chosen without making it an error', async () => {
    mockChosen = [];
    await render(<MeInterestsPage />);

    expect(screen.getByText('고른 관심사가 없어요')).toBeOnTheScreen();
  });

  it('offers a retry when the topics could not be loaded', async () => {
    mockTopics = undefined;
    mockLoadFailed = true;
    await render(<MeInterestsPage />);

    expect(screen.getByText('관심사를 불러오지 못했어요')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
    expect(mockRetry).toHaveBeenCalled();
  });

  it('says a refused save, keeping the topics on screen', async () => {
    mockSaveFailed = true;
    await render(<MeInterestsPage />);

    expect(screen.getByText('관심사를 저장하지 못했어요. 다시 시도해 주세요.')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: '카페' })).toBeOnTheScreen();
  });
});
