import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { useChosenInterests, useInterestTopics, useToggleInterest } from './use-interests';

let mockSignedIn = true;
jest.mock('@/entities/session', () => ({
  useIsAuthenticated: () => mockSignedIn,
}));

// The HTTP boundary. The query cache and the hooks composing it run for real.
const mockGetChosen = jest.fn<Promise<string[]>, []>();
const mockUpdate = jest.fn<Promise<string[]>, [string[]]>();
const mockGetTopics = jest.fn<Promise<Array<{ id: string; label: string }>>, []>();
jest.mock('../api/interests-api', () => ({
  getChosenInterests: () => mockGetChosen(),
  updateInterests: (interests: string[]) => mockUpdate(interests),
  getInterestTopics: () => mockGetTopics(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function render() {
  // Mutations too: a toggle's mutation, left by the unmount, would start the
  // default 5-minute GC timer and keep jest from exiting after the run.
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(
    () => ({
      chosen: useChosenInterests(),
      topics: useInterestTopics(),
      toggler: useToggleInterest(),
    }),
    { wrapper },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignedIn = true;
  mockGetChosen.mockResolvedValue(['cafe']);
  mockGetTopics.mockResolvedValue([
    { id: 'cafe', label: '카페' },
    { id: 'travel', label: '여행' },
  ]);
});

describe('useToggleInterest', () => {
  it('shows a tap at once and keeps the server’s answer', async () => {
    const answer = deferred<string[]>();
    mockUpdate.mockReturnValue(answer.promise);
    const { result } = await render();
    await waitFor(() => expect(result.current.chosen).toEqual(['cafe']));

    await act(async () => result.current.toggler.toggle('travel'));

    expect(mockUpdate).toHaveBeenCalledWith(['cafe', 'travel']);
    expect(result.current.chosen).toEqual(['cafe', 'travel']);
    await act(async () => answer.resolve(['cafe', 'travel']));
    expect(result.current.chosen).toEqual(['cafe', 'travel']);
    expect(result.current.toggler.failed).toBe(false);
  });

  it('turns an interest off with a second tap', async () => {
    mockUpdate.mockImplementation(async (interests) => interests);
    const { result } = await render();
    await waitFor(() => expect(result.current.chosen).toEqual(['cafe']));

    await act(async () => result.current.toggler.toggle('cafe'));

    expect(mockUpdate).toHaveBeenCalledWith([]);
    await waitFor(() => expect(result.current.chosen).toEqual([]));
  });

  it('puts the previous choice back and says so when the server refuses', async () => {
    mockUpdate.mockRejectedValue(new Error('offline'));
    const { result } = await render();
    await waitFor(() => expect(result.current.chosen).toEqual(['cafe']));

    await act(async () => result.current.toggler.toggle('travel'));

    await waitFor(() => expect(result.current.toggler.failed).toBe(true));
    expect(result.current.chosen).toEqual(['cafe']);
  });

  it('commits only the newest write — a late older answer does not undo a newer tap', async () => {
    const first = deferred<string[]>();
    const second = deferred<string[]>();
    mockUpdate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = await render();
    await waitFor(() => expect(result.current.chosen).toEqual(['cafe']));

    await act(async () => result.current.toggler.toggle('travel'));
    await act(async () => result.current.toggler.toggle('cafe'));
    await act(async () => second.resolve(['travel']));
    await act(async () => first.resolve(['cafe', 'travel']));

    expect(result.current.chosen).toEqual(['travel']);
  });

  it('does nothing before the choice has loaded', async () => {
    mockGetChosen.mockReturnValue(new Promise(() => {}));
    const { result } = await render();

    await act(async () => result.current.toggler.toggle('travel'));

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('useInterestTopics', () => {
  it('reports a failed load and asks again on retry', async () => {
    mockGetTopics.mockRejectedValueOnce(new Error('offline'));
    const { result } = await render();
    await waitFor(() => expect(result.current.topics.failed).toBe(true));

    await act(async () => result.current.topics.retry());

    await waitFor(() => expect(result.current.topics.topics).toHaveLength(2));
  });

  it('does not ask the server while signed out', async () => {
    mockSignedIn = false;
    const { result } = await render();

    expect(result.current.chosen).toBeUndefined();
    expect(mockGetChosen).not.toHaveBeenCalled();
    expect(mockGetTopics).not.toHaveBeenCalled();
  });
});
