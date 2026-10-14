import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { useNow } from './use-now';

const HourMs = 60 * 60 * 1000;

describe('useNow', () => {
  let listener: ((status: AppStateStatus) => void) | undefined;
  const remove = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers({ now: 1_000_000_000_000 });
    listener = undefined;
    remove.mockClear();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      listener = handler as (status: AppStateStatus) => void;
      return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // The movie tab stays mounted for days; a clock read once at mount kept the
  // cards' "N일 남음" from moving (2026-10-13 review).
  it('reads the clock again every step', async () => {
    const { result } = await renderHook(() => useNow(HourMs));
    const first = result.current;

    await act(async () => jest.advanceTimersByTime(HourMs));

    expect(result.current).toBe(first + HourMs);
  });

  it('reads the clock again when the app comes back to the foreground', async () => {
    const { result } = await renderHook(() => useNow(HourMs));
    const first = result.current;
    jest.setSystemTime(first + 5 * HourMs + 1234);

    await act(async () => listener?.('active'));

    expect(result.current).toBe(first + 5 * HourMs + 1234);
  });

  it('stops listening when unmounted', async () => {
    const { unmount } = await renderHook(() => useNow(HourMs));

    await act(async () => unmount());

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
