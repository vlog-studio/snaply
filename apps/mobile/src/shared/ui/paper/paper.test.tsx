import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { Sizes } from '@/shared/ui/theme';

import { PaperGround, PaperPiece, tiltFor, type PaperEdge, type PaperKind } from './paper';

/** The SVG canvases drawn. On Android each is a bitmap the size of its view. */
function canvasHeights() {
  return screen.container
    .queryAll((node) => node.type === 'RNSVGSvgView')
    .map((node) => Number(node.props.height));
}

/** Lays the rendered piece or ground out at a size, as the native layout pass would. */
function layOut(width: number, height: number) {
  const [outer] = screen.container.children;
  if (typeof outer !== 'object' || outer === null) throw new Error('nothing rendered');
  return fireEvent(outer, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height } },
  });
}

/** How far down the page the lowest printed rule reaches. */
function lowestRule() {
  const tops = screen.container
    .queryAll((node) => {
      const style = StyleSheet.flatten(node.props.style);
      return node.type === 'View' && style?.height === 1 && typeof style.top === 'number';
    })
    .map((node) => StyleSheet.flatten(node.props.style).top as number);
  return Math.max(...tops) + 1;
}

describe('PaperGround', () => {
  // A long snap library on grid paper (or a long movie shelf on ruled paper)
  // used to be one canvas as tall as the scroll content: past 100MB Android
  // refuses to draw it and the tab crashes on open.
  it.each<[PaperKind, number]>([
    ['ruled', Sizes.rulePitch],
    ['grid', 16],
  ])(
    'prints a %s page as long as a whole library to its foot with no canvas',
    async (kind, pitch) => {
      await render(<PaperGround kind={kind} />);

      await layOut(390, 40_000);

      expect(canvasHeights()).toEqual([]);
      expect(lowestRule()).toBeGreaterThan(40_000 - pitch);
    },
  );

  it('keeps printing as the content under it grows', async () => {
    await render(<PaperGround kind="ruled" />);

    await layOut(390, 900);
    await layOut(390, 12_000);

    expect(lowestRule()).toBeGreaterThan(12_000 - Sizes.rulePitch);
  });
});

describe('PaperPiece', () => {
  // RN-1 on the parallel redesign, and 최근 삭제 here: a receipt holding the
  // whole list was one canvas as tall as the list, and past about a hundred
  // deleted snaps Android refused to draw it.
  it.each<[PaperEdge, number]>([
    ['tornBottom', 1],
    ['tornTop', 1],
    ['deckle', 2],
    ['cut', 0],
  ])(
    'draws a %s piece of any height with no canvas taller than its edge',
    async (edge, canvases) => {
      await render(
        <PaperPiece edge={edge}>
          <Text>200 lines</Text>
        </PaperPiece>,
      );

      await layOut(390, 17_000);

      const heights = canvasHeights();
      expect(heights).toHaveLength(canvases);
      // A tear is a few dp deep, whatever the piece holds.
      heights.forEach((height) => expect(height).toBeLessThan(16));
      expect(screen.getByText('200 lines')).toBeOnTheScreen();
    },
  );
});

describe('tiltFor', () => {
  it('gives the same item the same tilt every time', () => {
    expect(tiltFor('snap-1', 3)).toBe(tiltFor('snap-1', 3));
  });

  it('stays within the step for the kind of piece', () => {
    for (const id of ['a', 'snap-2', 'movie-9f3', '한글', '']) {
      expect(Math.abs(tiltFor(id, 2))).toBeLessThanOrEqual(2);
    }
    expect(tiltFor('anything', 0)).toBe(0);
  });

  it('spreads different items across both directions', () => {
    const tilts = new Set(
      Array.from({ length: 40 }, (_, index) => Math.sign(tiltFor(`snap-${index}`, 3))),
    );
    expect(tilts).toEqual(new Set([-1, 0, 1]));
  });
});
