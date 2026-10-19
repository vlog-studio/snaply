import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import 'react-native-gesture-handler/jestSetup';

import { Sizes, ThemeScope } from '@/shared/ui/theme';

import { ExtractPxPerSec } from '../model/extract-strip-layout';
import { ExtractWindow } from './extract-window';

const durationSec = 96;

async function renderWindow({ startSec, endSec }: { startSec: number; endSec: number }) {
  await render(
    <ThemeScope scheme="dark">
      <ExtractWindow
        track={{ width: durationSec * ExtractPxPerSec, durationSec, stepSec: 0.1 }}
        startSec={startSec}
        endSec={endSec}
        minSec={0.5}
        maxSec={5}
        progressSec={startSec}
        isPlaying={false}
        progressIntervalSec={0.25}
        onWindow={jest.fn()}
        onDraggingChange={jest.fn()}
      />
    </ThemeScope>,
  );
}

function widthOf(label: string): number {
  const { width } = StyleSheet.flatten(screen.getByLabelText(label).props.style);
  return typeof width === 'number' ? width : 0;
}

describe('ExtractWindow', () => {
  // The grips were 18dp touch targets, under the 48dp minimum (decision 4), and
  // at 0:00 the start one sat inside Android's back-gesture band.
  it.each(['구간 시작 지점', '구간 끝 지점'])(
    'gives the %s grip a 48dp touch area',
    async (label) => {
      await renderWindow({ startSec: 0, endSec: 3 });

      expect(widthOf(label)).toBeGreaterThanOrEqual(Sizes.touchMin);
    },
  );
});
