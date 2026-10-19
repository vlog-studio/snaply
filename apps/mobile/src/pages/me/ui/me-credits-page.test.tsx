import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';

import { Colors, ThemeScope } from '@/shared/ui/theme';

import { MeCreditsPage } from './me-credits-page';

// The theme-mode store persists through SecureStore.
jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockBalanceKey = ['credit', 'balance'];
jest.mock('@/entities/credit', () => ({
  creditQueries: {
    balance: () => ({ queryKey: mockBalanceKey, queryFn: jest.fn() }),
  },
}));

// The ad flow is the feature's own test; the screen only reads its phase and
// the server's availability.
const mockAvailabilityKey = ['ad-reward', 'availability'];
jest.mock('@/features/watch-reward-ad', () => ({
  adRewardQueries: {
    availability: () => ({ queryKey: mockAvailabilityKey, queryFn: jest.fn() }),
  },
  useWatchRewardAd: () => ({ watchAd: jest.fn(), phase: 'idle' }),
}));

async function renderPage({ night = false } = {}) {
  // Seeded and never stale or collected, so the screen renders without a
  // request and no cache timer outlives the test.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  queryClient.setQueryData(mockBalanceKey, {
    balance: 480,
    entries: [
      { id: 'a', delta: -20, reason: 'draft_charge', createdAt: new Date(2026, 9, 19, 9, 30) },
      { id: 'b', delta: 500, reason: 'signup_bonus', createdAt: new Date(2026, 9, 18, 8, 0) },
    ],
  });
  queryClient.setQueryData(mockAvailabilityKey, {
    enabled: true,
    rewardCredits: 10,
    dailyLimit: 5,
    remainingToday: 3,
    resetsAt: new Date(2026, 9, 20),
  });
  const page = (
    <QueryClientProvider client={queryClient}>
      <MeCreditsPage />
    </QueryClientProvider>
  );
  return render(night ? <ThemeScope scheme="dark">{page}</ThemeScope> : page);
}

describe('MeCreditsPage', () => {
  // A gain is cherry as text, which is cherry ink: the cherry fill reads at
  // about 2.2:1 on the night sheet.
  it.each([
    ['by day', false, Colors.light.cherryInk],
    ['at night', true, Colors.dark.cherryInk],
  ])('prints a gain in the ledger in cherry ink %s', async (_when, night, ink) => {
    await renderPage({ night });

    expect(screen.getByText('+500')).toHaveStyle({ color: ink });
  });

  it('prints a spend in muted ink', async () => {
    await renderPage();

    expect(screen.getByText('-20')).toHaveStyle({ color: Colors.light.textSecondary });
  });

  // The day's remaining count is the row's read-out; a screen reader hears it
  // with the offer, not the offer alone.
  it('reads the ad row with the count left today', async () => {
    await renderPage();

    expect(
      screen.getByRole('button', { name: '광고 보고 크레딧 10 받기, 오늘 3회 남음' }),
    ).toBeOnTheScreen();
  });
});
