import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, ScrollView, StyleSheet, Text } from 'react-native';

import { MovieNotices, MovieNoticesMaxShare } from './movie-notices';

// The test renderer has no layout pass, so each band's place in the region is
// reported by hand, as the platform would after each layout.
const scrollTo = jest.mocked(ScrollView.prototype.scrollTo);

const LeftOut = '스냅 2개는 넣지 않았어요';
const CutRefusal = '컷이 최소 1개는 있어야 해요.';
const RunRefusal = '크레딧이 부족해요.';

function Notices({
  leftOut = false,
  cutRefusal,
  runRefused = false,
}: {
  leftOut?: boolean;
  cutRefusal?: string;
  runRefused?: boolean;
}) {
  return (
    <MovieNotices>
      {runRefused ? <Text>{RunRefusal}</Text> : null}
      {cutRefusal ? <Text key={cutRefusal}>{cutRefusal}</Text> : null}
      {leftOut ? <Text>{LeftOut}</Text> : null}
    </MovieNotices>
  );
}

function layOut(text: string, y: number) {
  return fireEvent(screen.getByText(text), 'layout', {
    nativeEvent: { layout: { x: 24, y, width: 312, height: 48 } },
  });
}

/** The region: the nearest scroll view the band stands in. */
function regionOf(text: string) {
  let node = screen.getByText(text).parent;
  while (node && node.type !== 'RCTScrollView') node = node.parent;
  if (!node) throw new Error(`${text} is not in a scroll region`);
  return node;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MovieNotices', () => {
  // On a 360×780dp phone a restore band and a refusal pushed the footer — the
  // ticket that answers the refusal, the remake confirm, the inspector — under
  // the navigation bar, and nothing on the screen could scroll it back
  // (2026-10-19 review, MOVIE-1).
  it('stands in a scroll region capped at a share of the window that gives way first', async () => {
    await render(<Notices leftOut runRefused />);

    const region = regionOf(RunRefusal);
    expect(regionOf(LeftOut)).toBe(region);
    const style = StyleSheet.flatten(region.props.style);
    expect(style.maxHeight).toBe(
      Math.round(Dimensions.get('window').height * MovieNoticesMaxShare),
    );
    // The one zone of the column that shrinks, and never stretches.
    expect(style.flexShrink).toBe(1);
    expect(style.flexGrow).toBe(0);
  });

  it('takes no room when no band stands', async () => {
    const view = await render(<Notices />);

    expect(view.toJSON()).toBeNull();
  });

  it('opens at its top', async () => {
    await render(<Notices leftOut runRefused />);

    await layOut(RunRefusal, 2);
    await layOut(LeftOut, 58);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  // A band that lands past what the region can show would be the answer to the
  // press, left as a sliver at the region's bottom.
  it('scrolls to a band that arrives below the ones standing', async () => {
    const view = await render(<Notices runRefused />);
    await layOut(RunRefusal, 2);

    await view.rerender(<Notices runRefused leftOut />);
    await layOut(LeftOut, 58);

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 56, animated: true });
  });

  // A refused run stays up until the next run press, so a refused cut edit can
  // arrive under it while the left-out band stands lower down.
  it('scrolls to a band that arrives between the ones standing, and only once', async () => {
    const view = await render(<Notices runRefused leftOut />);
    await layOut(RunRefusal, 2);
    await layOut(LeftOut, 58);

    await view.rerender(<Notices runRefused cutRefusal={CutRefusal} leftOut />);
    // The band under it moves down; that is not an arrival.
    await layOut(LeftOut, 114);
    expect(scrollTo).not.toHaveBeenCalled();
    await layOut(CutRefusal, 58);

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 56, animated: true });

    // Laid out again — the region resized — it is no longer news.
    await layOut(CutRefusal, 58);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('counts a band whose words change as a new one when it is keyed by them', async () => {
    const view = await render(<Notices cutRefusal={CutRefusal} leftOut />);
    await layOut(CutRefusal, 2);
    await layOut(LeftOut, 58);

    await view.rerender(<Notices cutRefusal="한 편에 들어가는 스냅 수를 넘었어요." leftOut />);
    await layOut('한 편에 들어가는 스냅 수를 넘었어요.', 2);

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  // A band going away leaves the region where the user has it.
  it('stays put when a band goes away', async () => {
    const view = await render(<Notices runRefused cutRefusal={CutRefusal} leftOut />);
    await layOut(RunRefusal, 2);
    await layOut(CutRefusal, 58);
    await layOut(LeftOut, 114);

    await view.rerender(<Notices runRefused leftOut />);
    await layOut(LeftOut, 58);

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
