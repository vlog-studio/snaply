import { act, renderHook } from '@testing-library/react-native';

import type { SnapSyncEntry } from '@/entities/snap';

import { useNoticePreselection } from './use-notice-preselection';

const DayMs = 24 * 60 * 60 * 1000;
const libraryIds = ['soon', 'later'];
const deadlines: Record<string, SnapSyncEntry> = {
  soon: { status: 'uploaded', videoId: 'v1', expiresAt: Date.now() + 2 * DayMs },
  later: { status: 'uploaded', videoId: 'v2', expiresAt: Date.now() + 9 * DayMs },
};

type Props = {
  arrival: string | undefined;
  ready: boolean;
  syncEntries: Record<string, SnapSyncEntry>;
  picked: string[];
};

function setup(initial: Props) {
  const replace = jest.fn();
  const view = renderHook(
    (props: Props) => useNoticePreselection({ ...props, libraryIds, replace }),
    {
      initialProps: initial,
    },
  );
  return { replace, view };
}

const noPicks: string[] = [];

// A tap that launched the app used to read the deadlines before their store came
// back, and settled on nothing picked (2026-10-13 review).
describe('useNoticePreselection', () => {
  it('waits for the deadlines before picking the snaps about to go', async () => {
    const { replace, view } = setup({
      arrival: 'album:1',
      ready: false,
      syncEntries: {},
      picked: noPicks,
    });
    const { rerender } = await view;
    expect(replace).not.toHaveBeenCalled();

    await act(async () =>
      rerender({ arrival: 'album:1', ready: true, syncEntries: deadlines, picked: noPicks }),
    );

    expect(replace).toHaveBeenCalledWith(['soon']);
  });

  it('keeps waiting while no deadline has arrived yet', async () => {
    const { replace, view } = setup({
      arrival: 'album:1',
      ready: true,
      syncEntries: {},
      picked: noPicks,
    });
    const { rerender } = await view;
    expect(replace).not.toHaveBeenCalled();

    // The startup reconcile writes the deadlines a moment later.
    await act(async () =>
      rerender({ arrival: 'album:1', ready: true, syncEntries: deadlines, picked: noPicks }),
    );

    expect(replace).toHaveBeenCalledWith(['soon']);
  });

  it('stops waiting once the user picks something themselves', async () => {
    const { replace, view } = setup({
      arrival: 'album:1',
      ready: true,
      syncEntries: {},
      picked: noPicks,
    });
    const { rerender } = await view;

    await act(async () =>
      rerender({ arrival: 'album:1', ready: true, syncEntries: {}, picked: ['later'] }),
    );
    await act(async () =>
      rerender({ arrival: 'album:1', ready: true, syncEntries: deadlines, picked: ['later'] }),
    );

    expect(replace).not.toHaveBeenCalled();
  });

  it('replaces picks that were already there when the notice arrived', async () => {
    const earlier = ['later'];
    const { replace, view } = setup({
      arrival: 'album:1',
      ready: true,
      syncEntries: deadlines,
      picked: earlier,
    });
    await view;

    expect(replace).toHaveBeenCalledWith(['soon']);
  });

  it('picks once per arrival, and again for the next notice', async () => {
    const { replace, view } = setup({
      arrival: 'album:1',
      ready: true,
      syncEntries: deadlines,
      picked: noPicks,
    });
    const { rerender } = await view;
    await act(async () =>
      rerender({ arrival: 'album:1', ready: true, syncEntries: deadlines, picked: ['soon'] }),
    );
    expect(replace).toHaveBeenCalledTimes(1);

    await act(async () =>
      rerender({ arrival: 'album:2', ready: true, syncEntries: deadlines, picked: [] }),
    );

    expect(replace).toHaveBeenCalledTimes(2);
  });

  it('does nothing for an arrival that is not an expiry notice', async () => {
    const { replace, view } = setup({
      arrival: undefined,
      ready: true,
      syncEntries: deadlines,
      picked: noPicks,
    });
    await view;

    expect(replace).not.toHaveBeenCalled();
  });
});
