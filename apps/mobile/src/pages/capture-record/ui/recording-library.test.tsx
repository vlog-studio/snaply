import { fireEvent, render, screen } from '@testing-library/react-native';
import { type ComponentProps } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { formatDateTime } from '@/shared/lib/datetime';
import type { LocalRecording } from '@/shared/lib/recording-files';
import { Colors, ThemeScope } from '@/shared/ui/theme';

import { RecordingLibrary } from './recording-library';

// The library and its sheet pad themselves by the safe area.
const ScreenMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 360, height: 800 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

function recordingAt(minute: number): LocalRecording {
  return {
    id: `snaply-${minute}.mp4`,
    uri: `file:///recordings/snaply-${minute}.mp4`,
    fileName: `snaply-${minute}.mp4`,
    size: 2_400_000,
    createdAt: new Date(2026, 9, 17, 14, minute).getTime(),
  };
}

const first = recordingAt(31);
const second = recordingAt(45);

const deleteLabel = (recording: LocalRecording) =>
  `${formatDateTime(recording.createdAt)} 스냅 삭제`;
const rowLabel = (recording: LocalRecording) => `${formatDateTime(recording.createdAt)} 찍은 스냅`;

type LibraryProps = ComponentProps<typeof RecordingLibrary>;

function libraryProps(kept: boolean): LibraryProps {
  return {
    isLoading: false,
    onClose: jest.fn(),
    onDelete: jest.fn().mockResolvedValue(undefined),
    canDeleteFromDevice: jest.fn(() => kept),
    onDeleteFromDevice: jest.fn().mockResolvedValue(undefined),
    onSelect: jest.fn(),
    recordings: [first, second],
    visible: true,
  };
}

// Pinned dark, as the capture screen pins everything it opens.
function tree(props: LibraryProps) {
  return (
    <SafeAreaProvider initialMetrics={ScreenMetrics}>
      <ThemeScope scheme="dark">
        <RecordingLibrary {...props} />
      </ThemeScope>
    </SafeAreaProvider>
  );
}

async function renderLibrary(kept: boolean) {
  const props = libraryProps(kept);
  const view = await render(tree(props));
  return { props, view };
}

describe('RecordingLibrary', () => {
  it('asks once and deletes a recording that never reached the server for good', async () => {
    const { props } = await renderLibrary(false);

    await fireEvent.press(screen.getByRole('button', { name: deleteLabel(first) }));

    expect(screen.getByText('삭제한 스냅은 되돌릴 수 없어요.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '이 기기에서만 삭제' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '삭제' }));

    expect(props.onDelete).toHaveBeenCalledWith(first);
    expect(props.onDeleteFromDevice).not.toHaveBeenCalled();
  });

  it.each([
    ['이 기기에서만 삭제', 'onDeleteFromDevice'],
    ['모든 기기에서 삭제', 'onDelete'],
  ] as const)('runs %s for a snap the server keeps', async (answer, handler) => {
    const { props } = await renderLibrary(true);

    await fireEvent.press(screen.getByRole('button', { name: deleteLabel(first) }));
    await fireEvent.press(screen.getByRole('button', { name: answer }));

    expect(props[handler]).toHaveBeenCalledWith(first);
    expect(
      props[handler === 'onDelete' ? 'onDeleteFromDevice' : 'onDelete'],
    ).not.toHaveBeenCalled();
  });

  it.each([
    ['a recording only this device has', false],
    ['a recording the server keeps', true],
  ])('deletes nothing when the question about %s is cancelled', async (_case, kept) => {
    const { props } = await renderLibrary(kept);

    await fireEvent.press(screen.getByRole('button', { name: deleteLabel(first) }));
    await fireEvent.press(screen.getByRole('button', { name: '삭제 취소' }));

    expect(props.onDelete).not.toHaveBeenCalled();
    expect(props.onDeleteFromDevice).not.toHaveBeenCalled();
    expect(screen.queryByText('스냅을 삭제할까요?')).toBeNull();
  });

  // The sheet is drawn inside the library's own modal, so TalkBack could swipe
  // past it onto the rows: another row's 삭제 silently swapped the question's
  // target, and a row could be selected under the sheet. The system alert the
  // sheet replaced was modal for screen readers.
  it('takes the list out of the screen-reader order while the question is up', async () => {
    await renderLibrary(false);

    await fireEvent.press(screen.getByRole('button', { name: deleteLabel(first) }));

    expect(screen.queryByRole('button', { name: deleteLabel(second) })).toBeNull();
    expect(screen.queryByRole('button', { name: rowLabel(second) })).toBeNull();
    expect(screen.queryByRole('button', { name: '스냅 목록 닫기' })).toBeNull();
    expect(screen.getByRole('button', { name: '삭제' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: '삭제 취소' }));

    expect(screen.getByRole('button', { name: deleteLabel(second) })).toBeTruthy();
  });

  // The kept/local judgement read live state (sync entries, the clock) on every
  // render, so an upload finishing while the sheet was up swapped 취소/삭제 for
  // the three-answer stack under the user's finger.
  it('keeps the question it opened with when the snap reaches the server meanwhile', async () => {
    const { props, view } = await renderLibrary(false);

    await fireEvent.press(screen.getByRole('button', { name: deleteLabel(first) }));
    await view.rerender(tree({ ...props, canDeleteFromDevice: jest.fn(() => true) }));

    expect(screen.getByText('삭제한 스냅은 되돌릴 수 없어요.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '이 기기에서만 삭제' })).toBeNull();
  });

  // A delete that is only a word is ink on a kraft marker (the design
  // system's usage rule); the rows printed it as bare cream ink.
  it("marks each row's 삭제 in kraft", async () => {
    await renderLibrary(false);

    for (const word of screen.getAllByText('삭제')) {
      expect(word).toHaveStyle({
        color: Colors.dark.stickerInk,
        backgroundColor: Colors.dark.kraft,
      });
    }
  });

  it('drops an open question when the library closes', async () => {
    const { props, view } = await renderLibrary(false);

    await fireEvent.press(screen.getByRole('button', { name: deleteLabel(first) }));
    await view.rerender(tree({ ...props, visible: false }));
    await view.rerender(tree({ ...props, visible: true }));

    expect(screen.queryByText('스냅을 삭제할까요?')).toBeNull();
    expect(screen.getByRole('button', { name: deleteLabel(first) })).toBeTruthy();
  });
});
