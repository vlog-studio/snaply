import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Snap } from '@/entities/snap';

import type { Cut } from '../model/use-movie-cuts';
import { CutInspector } from './cut-inspector';

const snap: Snap = {
  id: 's1',
  uri: 'file:///doc/recordings/s1.mp4',
  durationSec: 3,
  capturedAt: 1_753_200_000_000,
  width: 1080,
  height: 1920,
  orientation: 'portrait',
};

const trimmed: Cut = {
  ref: { snapId: 's1', order: 0, trim: { startSec: 0.5, endSec: 2 } },
  snap,
  usedSec: 1.5,
  gone: undefined,
};

const expired: Cut = {
  ref: { snapId: 's2', order: 2 },
  snap: undefined,
  usedSec: 0,
  gone: 'expired',
};

async function inspect(cut: Cut, handlers: Partial<Parameters<typeof CutInspector>[0]> = {}) {
  await render(
    <CutInspector
      cut={cut}
      index={2}
      count={6}
      canRemove
      onMove={jest.fn()}
      onRemove={jest.fn()}
      onResetTrim={jest.fn()}
      onDeselect={jest.fn()}
      {...handlers}
    />,
  );
}

describe('CutInspector', () => {
  // One line beside 컷 3/6 left the reason about 66dp on a 360dp phone, so it
  // read 보관 기… and never told the user to take the cut out (2026-10-19
  // review, MOVIE-4).
  it('gives a dead cut’s reason the whole column on two lines', async () => {
    await inspect(expired);

    const reason = screen.getByText('보관 기간이 끝났어요 · 빼 주세요');
    expect(reason).toHaveProp('numberOfLines', 2);
    expect(screen.queryByText(/컷 3\/6/)).toBeNull();
    // Its number stays in the names of the buttons that act on it.
    expect(screen.getByRole('button', { name: '컷 3 빼기' })).toBeOnTheScreen();
  });

  // 전체 사용 was 12dp cherry-ink note text — the error colour on an action —
  // about 28dp tall to the touch (MOVIE-5).
  it('offers 전체 사용 on a trimmed cut as a text button', async () => {
    const onResetTrim = jest.fn();
    await inspect(trimmed, { onResetTrim });

    const reset = screen.getByRole('button', { name: '컷 3 전체 사용' });
    expect(reset.props.hitSlop).toEqual(expect.objectContaining({ top: 14, bottom: 14 }));
    await fireEvent.press(reset);
    expect(onResetTrim).toHaveBeenCalledWith(2);
    expect(screen.getByText(/컷 3\/6/)).toBeOnTheScreen();
  });

  it('grows the leading ✕ to a 48dp touch target', async () => {
    const onDeselect = jest.fn();
    await inspect(trimmed, { onDeselect });

    const release = screen.getByRole('button', { name: '컷 선택 해제' });
    // Drawn 32 × 40.
    expect(release.props.hitSlop).toEqual({ top: 4, bottom: 4, left: 8, right: 8 });
    await fireEvent.press(release);
    expect(onDeselect).toHaveBeenCalledTimes(1);
  });
});
