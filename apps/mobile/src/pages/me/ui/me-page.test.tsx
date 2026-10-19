import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import { MePage } from './me-page';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useScrollToTop: jest.fn(),
}));

// The page reads safe-area insets for its padding — a native answer a test has
// no provider for.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// The legal documents are pages on the API origin (spec ACC-12); a dev build
// without one offers no link.
let mockApiBaseUrl = 'https://api.example.test';
// A getter, so a test can change it after the module has been read.
jest.mock('@/shared/config/api', () => ({
  get API_BASE_URL() {
    return mockApiBaseUrl;
  },
}));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })),
}));

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
jest.mock('@/entities/session', () => ({
  useCurrentUser: () => ({ displayName: 'tester@example.com' }),
  useClearSession: () => jest.fn(),
}));
jest.mock('@/entities/snap', () => ({ useSnaps: () => [] }));
jest.mock('@/entities/movie', () => ({ useMovies: () => [] }));
let mockInstagram: { connection?: object; isLoaded: boolean; isError: boolean } = {
  isLoaded: true,
  isError: false,
};
jest.mock('@/entities/sns-connection', () => ({
  useSnsConnection: () => mockInstagram,
  needsReconnect: (connection: { tokenExpiresAt: Date | null }, now: number) =>
    connection.tokenExpiresAt === null || connection.tokenExpiresAt.getTime() <= now,
}));
const mockAnalysisConsent = jest.fn();
jest.mock('@/features/analysis-consent', () => ({
  useAnalysisConsent: () => mockAnalysisConsent(),
}));

jest.mock('@/features/notification-settings', () => ({
  useNotificationPreferences: () => ({
    locationAlerts: false,
    movieReady: true,
    quietStart: 22,
    quietEnd: 8,
  }),
}));

let mockNickname: string | null = null;
jest.mock('@/features/edit-nickname', () => ({
  useNickname: (fallback: string | undefined) => mockNickname ?? fallback,
  EditNicknameSheet: ({ name }: { name: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>{`nickname-sheet:${name}`}</Text>;
  },
}));

let mockAlbumAutoSave = false;
jest.mock('@/features/save-snap-to-album', () => ({
  useAlbumAutoSaveEnabled: () => mockAlbumAutoSave,
}));

// The read-out's wording is `interestReadOut`'s own test; here only that the row shows it.
jest.mock('@/features/choose-interests', () => ({
  interestReadOut: () => '카페 · 여행',
  useChosenInterests: () => ['cafe', 'travel'],
  useInterestTopics: () => ({
    topics: [
      { id: 'cafe', label: '카페' },
      { id: 'travel', label: '여행' },
    ],
    failed: false,
    retry: () => {},
  }),
}));

const interestsTitle = '\uAD00\uC2EC\uC0AC'; // 관심사
const comingSoon = '\uC900\uBE44 \uC911'; // 준비 중
const socialTitle = '\uC18C\uC15C \uC5F0\uACB0'; // 소셜 연결
const notificationsTitle = '\uC54C\uB9BC'; // 알림
const analysisTitle = '\uC2A4\uB0C5 \uBD84\uC11D'; // 스냅 분석
const analysisOn = '\uCF1C\uC9D0'; // 켜짐
const analysisOff = '\uAEBC\uC9D0'; // 꺼짐

async function renderPage() {
  // Seeded and never stale or collected, so the balance row renders without a
  // request and no cache timer outlives the test.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  queryClient.setQueryData(mockBalanceKey, { balance: 400, entries: [] });
  return render(
    <QueryClientProvider client={queryClient}>
      <MePage />
    </QueryClientProvider>,
  );
}

describe('MePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset here rather than at the end of a test, so a failed assertion
    // cannot leave a nickname for the tests after it.
    mockNickname = null;
    mockApiBaseUrl = 'https://api.example.test';
    mockInstagram = { isLoaded: true, isError: false };
    mockAnalysisConsent.mockReturnValue({
      available: true,
      granted: false,
      grantedAt: null,
      isLoaded: true,
    });
  });

  // ACC-5: the name is the way to change it, and a saved nickname wins over
  // the sign-in identity's name.
  it('shows the nickname once set and opens the sheet from the name', async () => {
    mockNickname = '다연';
    await renderPage();

    await fireEvent.press(screen.getByRole('button', { name: '이름 다연 · 바꾸기' }));

    expect(screen.getByText('nickname-sheet:다연')).toBeOnTheScreen();
  });

  it('falls back to the sign-in name before a nickname is set', async () => {
    await renderPage();

    expect(screen.getByText('tester@example.com')).toBeOnTheScreen();
  });

  // ACC-5: the row reads the chosen interests and opens the screen that changes them.
  it('reads 관심사 as the chosen topics and opens its screen', async () => {
    await renderPage();

    expect(screen.getByText('카페 · 여행')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: `${interestsTitle}, 카페 · 여행` }));

    expect(mockPush).toHaveBeenCalledWith('/settings/interests');
  });

  // Instagram can be linked (SNS-8); the row reads the link and opens its screen.
  it('reads 소셜 연결 as the linked account and opens its screen', async () => {
    mockInstagram = {
      isLoaded: true,
      isError: false,
      connection: { username: 'snaply', tokenExpiresAt: new Date(Date.now() + 86_400_000) },
    };
    await renderPage();

    expect(screen.getByText('Instagram @snaply')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: `${socialTitle}, Instagram @snaply` }),
    );
    expect(mockPush).toHaveBeenCalledWith('/settings/social');
  });

  // A link whose access ran out, or whose end nobody knows, must be made again
  // before a post can go through — the summary says so before the user tries.
  it('reads 소셜 연결 as needing a new link when the access cannot be trusted', async () => {
    mockInstagram = {
      isLoaded: true,
      isError: false,
      connection: { username: 'snaply', tokenExpiresAt: null },
    };
    await renderPage();

    expect(screen.getByText('Instagram 다시 연결 필요')).toBeTruthy();
  });

  it('reads 소셜 연결 as unlinked when there is no account', async () => {
    await renderPage();

    expect(screen.getByText('연결된 계정 없음')).toBeTruthy();
  });

  // The read-out is the state the root exists to show, so a screen reader
  // hears it with the row's name, not the name alone.
  it('reads each row with its read-out and keeps it a button', async () => {
    await renderPage();

    expect(screen.getByRole('button', { name: '크레딧, 400 크레딧' })).toBeTruthy();
    expect(screen.getByRole('button', { name: `${notificationsTitle}, 무비 완성` })).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  // The automatic album copy is off until the user turns it on (SNAP-18); the
  // row reads it and opens the screen where it is changed.
  it('reads \uC568\uBC94 \uC800\uC7A5 as its automatic copy and opens its screen', async () => {
    mockAlbumAutoSave = true;
    await renderPage();

    expect(screen.getByText('\uC790\uB3D9 \uC800\uC7A5 \uCF1C\uC9D0')).toBeTruthy(); // 자동 저장 켜짐
    await fireEvent.press(screen.getByRole('button', { name: '앨범 저장, 자동 저장 켜짐' }));
    expect(mockPush).toHaveBeenCalledWith('/settings/album');
    mockAlbumAutoSave = false;
  });

  // Analysis is opt-in (specs ANA-5); the row reads the account's answer and
  // opens the screen where it is changed.
  it('reads \uC2A4\uB0C5 \uBD84\uC11D as off and opens its screen', async () => {
    await renderPage();

    expect(screen.getByText(analysisOff)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: `${analysisTitle}, ${analysisOff}` }));
    expect(mockPush).toHaveBeenCalledWith('/settings/analysis');
  });

  // Withdrawing is the user's right whether or not the feature is running, so a
  // granted consent must stay one tap away even with the server switch off.
  it('keeps a granted consent reachable while the server has analysis off', async () => {
    mockAnalysisConsent.mockReturnValue({
      available: false,
      granted: true,
      grantedAt: new Date('2026-09-29T01:00:00.000Z'),
      isLoaded: true,
    });
    await renderPage();

    expect(screen.getByText(analysisOn)).toBeTruthy();
    expect(screen.getByRole('button', { name: `${analysisTitle}, ${analysisOn}` })).toBeTruthy();
  });

  it('reads \uC2A4\uB0C5 \uBD84\uC11D as \uC900\uBE44 \uC911, opening nothing, when there is nothing to turn on', async () => {
    mockAnalysisConsent.mockReturnValue({
      available: false,
      granted: false,
      grantedAt: null,
      isLoaded: true,
    });
    await renderPage();

    expect(screen.getByText(comingSoon)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: new RegExp(`^${analysisTitle}`) })).toBeNull();
  });

  // Spec ACC-12: both documents stay one tap away after signing in.
  it.each([
    ['이용약관', 'https://api.example.test/legal/terms'],
    ['개인정보 처리방침', 'https://api.example.test/legal/privacy'],
  ])('opens %s from the API origin in the in-app browser', async (label, url) => {
    await renderPage();

    await fireEvent.press(screen.getByRole('link', { name: label }));

    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(url);
    expect(mockPush).not.toHaveBeenCalled();
  });

  // How the address is built (a trailing slash, no origin) is the shared
  // helper's own test (`shared/config/legal.test.ts`); here, that the rows go.
  it('offers no document rows without an API origin to open them from', async () => {
    mockApiBaseUrl = '';
    await renderPage();

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('이용약관')).toBeNull();
  });

  // 계정 삭제 is an act on the account in bold ink — not red, which is the
  // main action; 로그아웃 beside it stays a plain line.
  it('sets 계정 삭제 in bold and 로그아웃 plain', async () => {
    await renderPage();

    expect(screen.getByText('계정 삭제')).toHaveStyle({ fontWeight: 700 });
    expect(screen.getByText('로그아웃')).toHaveStyle({ fontWeight: 400 });
  });

  // UTF-16 slicing would put half a surrogate pair in the ring.
  it('puts a whole emoji in the ring when a name opens with one', async () => {
    mockNickname = '😀다연';
    await renderPage();

    expect(screen.getByText('😀')).toBeOnTheScreen();
  });

  // The ring's discs and the count discs are fixed sizes; their text stops
  // growing at 1.3× so it stays inside them at the largest system text sizes.
  it('caps the text inside the fixed discs at 1.3×', async () => {
    await renderPage();

    expect(screen.getByText('월')).toHaveProp('maxFontSizeMultiplier', 1.3);
    expect(screen.getByText('t')).toHaveProp('maxFontSizeMultiplier', 1.3);
    for (const count of screen.getAllByText('0')) {
      expect(count).toHaveProp('maxFontSizeMultiplier', 1.3);
    }
  });

  // Clamped to one line beside its title, a read-out was cut mid-word with no
  // ellipsis at large system text on a narrow phone (자동 저). It wraps to its
  // own line instead, so no line of it is ever dropped.
  it('never clamps a read-out to one line', async () => {
    await renderPage();

    expect(screen.getByText('\uC790\uB3D9 \uC800\uC7A5 \uAEBC\uC9D0')).not.toHaveProp(
      'numberOfLines',
    ); // 자동 저장 꺼짐
  });
});
