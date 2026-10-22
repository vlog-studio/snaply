import { fireEvent, render, screen, within } from '@testing-library/react-native';

import type { FilledSlot } from '@/features/fill-template';
import { Sizes } from '@/shared/ui/theme';

import { controlsBelowText, SlotRow, type SlotRowProps } from './slot-row';

// The frame draws a thumbnail through a native call.
jest.mock('@/shared/ui/video-frame', () => ({ VideoFrame: () => null }));

// The row places its controls from the window. The React Native mock reports
// 2× text, so each test sets the phone it needs.
const mockWindow = { width: 412, height: 915, scale: 2.625, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

const slot = { id: 's1', label: '골목', hint: '좁은 길, 걷는 발' };

function filledSlot(overrides: Partial<FilledSlot> = {}): FilledSlot {
  return {
    slot,
    snap: {
      id: 'snap-1',
      uri: 'file:///snap-1.mp4',
      durationSec: 3,
      capturedAt: new Date(2026, 6, 28, 13, 35).getTime(),
      width: 1080,
      height: 1920,
      orientation: 'portrait',
    },
    confidence: 0.7,
    isDropped: false,
    canMoveUp: true,
    canMoveDown: true,
    ...overrides,
  };
}

async function renderRow(props: Partial<SlotRowProps> = {}) {
  const handlers = {
    onShoot: jest.fn(),
    onDrop: jest.fn(),
    onRestore: jest.fn(),
    onMove: jest.fn(),
  };
  await render(
    <SlotRow filled={filledSlot()} confidenceKind="slot-fit" index={1} {...handlers} {...props} />,
  );
  return handlers;
}

const controlNames = ['골목 위로', '골목 아래로', '골목 컷 빼기'];

/** The nearest view holding both a control and the slot's capture time. */
function viewAroundControlAndTime(controlName: string) {
  let node = screen.getByRole('button', { name: controlName }).parent;
  while (node && within(node).queryByText('2026.07.28 13:35 · 3초') === null) node = node.parent;
  if (!node) throw new Error(`no view holds both ${controlName} and the capture time`);
  return node;
}

describe('SlotRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockWindow, { width: 412, fontScale: 1 });
  });

  // Decision 4: the controls were 28dp with a 10dp slop, the arrows stacked
  // 2dp apart; the slops overlapped and 위로 kept about 32×30dp of its own.
  it('gives each move and drop control a whole touch target of its own', async () => {
    await renderRow();

    for (const name of controlNames) {
      const control = screen.getByRole('button', { name });
      expect(control).toHaveStyle({ width: Sizes.touchMin, height: Sizes.touchMin });
      expect(control).not.toHaveProp('hitSlop');
    }
    // Side by side in one strip, as on the canvas, rather than stacked.
    const strip = screen.getByRole('button', { name: '골목 위로' }).parent;
    expect(strip).toHaveStyle({ flexDirection: 'row' });
    for (const name of controlNames) {
      expect(strip).toContainElement(screen.getByRole('button', { name }));
    }
  });

  it('moves and drops through its controls', async () => {
    const { onMove, onDrop } = await renderRow();

    await fireEvent.press(screen.getByRole('button', { name: '골목 위로' }));
    await fireEvent.press(screen.getByRole('button', { name: '골목 아래로' }));
    await fireEvent.press(screen.getByRole('button', { name: '골목 컷 빼기' }));

    expect(onMove.mock.calls).toEqual([
      [1, -1],
      [1, 1],
    ]);
    expect(onDrop).toHaveBeenCalledWith('s1');
  });

  // Three whole targets take 144dp; on a narrow phone or at large text the
  // name beside them would shrink to a glyph or two.
  it.each([
    ['beside the words at the normal size on a 412dp phone', 412, 1, false],
    ['under the words on a 360dp phone', 360, 1, true],
    ['under the words from 1.3× text', 412, 1.3, true],
  ])('puts the controls %s', async (_label, width, fontScale, below) => {
    Object.assign(mockWindow, { width, fontScale });
    await renderRow();

    // Under the words, the controls share the words' column with the time.
    const around = viewAroundControlAndTime('골목 위로');
    if (below) expect(around).not.toHaveStyle({ flexDirection: 'row' });
    else expect(around).toHaveStyle({ flexDirection: 'row' });
  });

  // Beside the controls the time line can outrun the row; cut short, it lost
  // the cut's length.
  it('lets the capture time wrap rather than cut off the length', async () => {
    await renderRow();

    expect(screen.getByText('2026.07.28 13:35 · 3초')).not.toHaveProp('numberOfLines');
  });
});

describe('controlsBelowText', () => {
  it.each([
    ['beside the words on a 412dp phone at the normal size', 412, 1, false],
    ['under the words on a 393dp phone', 393, 1, true],
    ['under the words on a 360dp phone', 360, 1, true],
    ['under the words at twice the size on a 412dp phone', 412, 2, true],
    ['beside the words on a tablet at twice the size', 800, 2, false],
  ])('puts the controls %s', (_label, width, fontScale, below) => {
    expect(controlsBelowText({ width, fontScale })).toBe(below);
  });
});
