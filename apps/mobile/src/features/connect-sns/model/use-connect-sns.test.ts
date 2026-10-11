import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { snsConnectionQueries } from '@/entities/sns-connection';

import { useConnectSns } from './use-connect-sns';

// The HTTP and browser boundaries; the query cache runs for real.
const mockGetConnectUrl = jest.fn<Promise<string>, [string]>();
const mockDisconnect = jest.fn<Promise<void>, [string]>();
const mockOpenAuthSession = jest.fn();
jest.mock('../api/get-connect-url', () => ({
  getConnectUrl: (platform: string) => mockGetConnectUrl(platform),
}));
jest.mock('../api/disconnect-sns', () => ({
  disconnectSns: (platform: string) => mockDisconnect(platform),
}));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSession(...args),
}));
// The app's incoming links — on Android the return can arrive here instead of the session.
let mockUrlListener: ((event: { url: string }) => void) | null = null;
const mockRemoveListener = jest.fn();
jest.mock('expo-linking', () => ({
  addEventListener: (_type: string, listener: (event: { url: string }) => void) => {
    mockUrlListener = listener;
    return { remove: mockRemoveListener };
  },
}));

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const hook = await renderHook(() => useConnectSns(), { wrapper });
  return { ...hook, invalidate };
}

const linksKey = { queryKey: snsConnectionQueries.all() };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetConnectUrl.mockResolvedValue('https://www.instagram.com/oauth/authorize?state=s');
});

describe('useConnectSns', () => {
  it('opens the approval and returns to the backend’s deep link', async () => {
    mockOpenAuthSession.mockResolvedValue({
      type: 'success',
      url: 'snaplyapp://sns/connected?platform=instagram',
    });
    const { result, invalidate } = await render();

    let linked = false;
    await act(async () => {
      linked = await result.current.connect('instagram');
    });

    expect(mockOpenAuthSession).toHaveBeenCalledWith(
      'https://www.instagram.com/oauth/authorize?state=s',
      'snaplyapp://sns',
    );
    expect(linked).toBe(true);
    expect(result.current.error).toBeNull();
    // Every screen reading the link moves at once.
    expect(invalidate).toHaveBeenCalledWith(linksKey);
  });

  // Closing the browser is the user's choice, not a failure to report.
  it('says nothing when the user closes the browser', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'cancel' });
    const { result } = await render();

    let linked = true;
    await act(async () => {
      linked = await result.current.connect('instagram');
    });

    expect(linked).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.pending).toBeNull();
  });

  // Android: the router takes the link and the session ends as a dismissal.
  it('reads the link the app heard when the session ends without it', async () => {
    mockOpenAuthSession.mockImplementation(async () => {
      mockUrlListener?.({ url: 'snaplyapp://sns/error?platform=instagram&reason=account_type' });
      return { type: 'dismiss' };
    });
    const { result } = await render();

    let linked = true;
    await act(async () => {
      linked = await result.current.connect('instagram');
    });

    expect(linked).toBe(false);
    expect(result.current.error).toBe(
      '프로페셔널 계정만 연결할 수 있어요. Instagram에서 계정 유형을 바꾼 뒤 다시 연결해 주세요.',
    );
    expect(mockRemoveListener).toHaveBeenCalled();
  });

  it('ignores links that are not the connect return', async () => {
    mockOpenAuthSession.mockImplementation(async () => {
      mockUrlListener?.({ url: 'snaplyapp://movie/1' });
      return { type: 'dismiss' };
    });
    const { result } = await render();

    await act(async () => {
      await result.current.connect('instagram');
    });

    expect(result.current.error).toBeNull();
  });

  it('names the fix when Instagram refuses a personal account', async () => {
    mockOpenAuthSession.mockResolvedValue({
      type: 'success',
      url: 'snaplyapp://sns/error?platform=instagram&reason=account_type',
    });
    const { result } = await render();

    await act(async () => {
      await result.current.connect('instagram');
    });

    expect(result.current.error).toBe(
      '프로페셔널 계정만 연결할 수 있어요. Instagram에서 계정 유형을 바꾼 뒤 다시 연결해 주세요.',
    );
  });

  it('reports a link that could not be started', async () => {
    mockGetConnectUrl.mockRejectedValue(new Error('offline'));
    const { result } = await render();

    await act(async () => {
      await result.current.connect('instagram');
    });

    expect(mockOpenAuthSession).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Instagram에 연결하지 못했어요. 다시 시도해 주세요.');
  });

  it('removes the link and re-reads it', async () => {
    mockDisconnect.mockResolvedValue(undefined);
    const { result, invalidate } = await render();

    let removed = false;
    await act(async () => {
      removed = await result.current.disconnect('instagram');
    });

    expect(removed).toBe(true);
    expect(mockDisconnect).toHaveBeenCalledWith('instagram');
    expect(invalidate).toHaveBeenCalledWith(linksKey);
  });
});
