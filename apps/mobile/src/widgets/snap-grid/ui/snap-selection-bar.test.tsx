import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from '@/shared/ui/theme';

import { SnapSelectionBar } from './snap-selection-bar';

const ConfirmLabel = '자동으로 편집하기'; // 자동으로 편집하기
const ClearLabel = '선택 해제'; // 선택 해제
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const DeleteLabel = '2개 스냅 삭제'; // 2개 스냅 삭제
const DeleteWord = '\uC0AD\uC81C'; // 삭제

async function renderBar(props: {
  busy?: boolean;
  confirmDisabled?: boolean;
  selectedCount?: number;
}) {
  const handlers = { onConfirm: jest.fn(), onClear: jest.fn(), onDelete: jest.fn() };
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SnapSelectionBar
        selectedCount={2}
        heldCount={0}
        capacity={30}
        targetLabel={'자동 편집'}
        confirmLabel={ConfirmLabel}
        {...handlers}
        {...props}
      />
    </SafeAreaProvider>,
  );
  return handlers;
}

describe('SnapSelectionBar', () => {
  it('takes no second confirm, and keeps the picks, while the target is answering', async () => {
    const handlers = await renderBar({ busy: true });

    // Announced as working, not as refused.
    const confirm = screen.getByRole('button', { name: ConfirmLabel, busy: true, disabled: true });
    fireEvent.press(confirm);
    fireEvent.press(screen.getByRole('button', { name: ClearLabel }));
    fireEvent.press(screen.getByRole('button', { name: DeleteLabel }));

    expect(handlers.onConfirm).not.toHaveBeenCalled();
    expect(handlers.onClear).not.toHaveBeenCalled();
    expect(handlers.onDelete).not.toHaveBeenCalled();
  });

  it('refuses only the confirm when the target cannot take the picks', async () => {
    const handlers = await renderBar({ confirmDisabled: true });

    fireEvent.press(screen.getByRole('button', { name: ConfirmLabel }));
    fireEvent.press(screen.getByRole('button', { name: ClearLabel }));

    expect(handlers.onConfirm).not.toHaveBeenCalled();
    expect(handlers.onClear).toHaveBeenCalled();
  });

  // Red is the main action; a delete is ink over a kraft highlighter (the
  // design system's sg-act--danger), and a disabled one drops the stroke.
  it('marks 삭제 with a kraft highlighter, not red ink', async () => {
    await renderBar({});

    const word = screen.getByText(DeleteWord);
    expect(word).toHaveStyle({
      color: Colors.light.stickerInk,
      backgroundColor: Colors.light.kraft,
    });
    expect(word).not.toHaveStyle({ color: Colors.light.cherryInk });
  });

  it('drops the highlighter while 삭제 cannot be pressed', async () => {
    await renderBar({ selectedCount: 0 });

    expect(screen.getByText(DeleteWord)).not.toHaveStyle({ backgroundColor: Colors.light.kraft });
  });

  // Clamped beside the count, the line was cut through its second line at 2x
  // system text on a 360dp phone; it moves to its own line instead.
  it('never clamps what the target can still take', async () => {
    await renderBar({});

    expect(
      screen.getByText('\uC790\uB3D9 \uD3B8\uC9D1 \u00B7 \uCD5C\uB300 30\uAC1C'),
    ).not.toHaveProp(
      // 자동 편집 · 최대 30개
      'numberOfLines',
    );
  });
});
