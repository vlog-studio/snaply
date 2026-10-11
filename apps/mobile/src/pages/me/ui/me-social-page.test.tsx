import { fireEvent, render, screen } from '@testing-library/react-native';

import type { SnsConnection } from '@/entities/sns-connection';

import { MeSocialPage } from './me-social-page';

let mockInstagram: { connection?: SnsConnection; isLoaded: boolean; isError: boolean };
jest.mock('@/entities/sns-connection', () => ({
  useSnsConnection: () => mockInstagram,
  needsReconnect: (connection: SnsConnection, now: number) =>
    connection.tokenExpiresAt === null || connection.tokenExpiresAt.getTime() <= now,
}));

const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
let mockPending: 'connect' | 'disconnect' | null = null;
let mockError: string | null = null;
jest.mock('@/features/connect-sns', () => ({
  useConnectSns: () => ({
    connect: mockConnect,
    disconnect: mockDisconnect,
    pending: mockPending,
    error: mockError,
  }),
}));

function linked(tokenExpiresAt: Date | null): SnsConnection {
  return { platform: 'instagram', username: 'snaply', connectedAt: new Date(0), tokenExpiresAt };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInstagram = { isLoaded: true, isError: false };
  mockPending = null;
  mockError = null;
});

describe('MeSocialPage', () => {
  it('offers to link Instagram when nothing is linked', async () => {
    await render(<MeSocialPage />);

    await fireEvent.press(screen.getByRole('button', { name: 'Instagram 연결' }));
    expect(mockConnect).toHaveBeenCalledWith('instagram');
  });

  // Unlinking asks nothing (linking again undoes it), so only the word is
  // pressable — the row itself must not unlink on a stray tap.
  it('unlinks only from the trailing word', async () => {
    mockInstagram = {
      isLoaded: true,
      isError: false,
      connection: linked(new Date(Date.now() + 86_400_000)),
    };
    await render(<MeSocialPage />);

    expect(screen.getByText('@snaply')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Instagram' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Instagram 연결 해제' }));
    expect(mockDisconnect).toHaveBeenCalledWith('instagram');
  });

  it('asks for a new link when the access cannot be trusted', async () => {
    mockInstagram = { isLoaded: true, isError: false, connection: linked(null) };
    await render(<MeSocialPage />);

    expect(screen.getByText('@snaply · 다시 연결이 필요해요')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Instagram 다시 연결' }));
    expect(mockConnect).toHaveBeenCalledWith('instagram');
  });

  // Before the server answers, nothing claims a link either way.
  it('offers nothing until the link has been read', async () => {
    mockInstagram = { isLoaded: false, isError: false };
    await render(<MeSocialPage />);

    expect(screen.queryByRole('button', { name: 'Instagram 연결' })).toBeNull();
  });

  // Posting to TikTok is blocked, so a link there would be a promise the app
  // cannot keep.
  it('shows TikTok as 준비 중 with nothing to press', async () => {
    await render(<MeSocialPage />);

    expect(screen.getByText('TikTok')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /TikTok/ })).toBeNull();
  });

  it('shows why the last attempt did not take', async () => {
    mockError = 'Instagram에 연결하지 못했어요. 다시 시도해 주세요.';
    await render(<MeSocialPage />);

    expect(screen.getByText(mockError)).toBeTruthy();
  });
});
