import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { Toast } from './toast';

const message = '스냅 2개를 삭제했어요'; // 스냅 2개를 삭제했어요
const undoLabel = '되돌리기'; // 되돌리기

const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions');

beforeEach(() => {
  jest.useFakeTimers();
  announce.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Toast', () => {
  it('offers its action and goes away by itself', async () => {
    const onDismiss = jest.fn();
    const onPress = jest.fn();
    await render(
      <Toast
        message={message}
        action={{ label: undoLabel, onPress }}
        onDismiss={onDismiss}
        bottomOffset={0}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: undoLabel }));
    expect(onPress).toHaveBeenCalledTimes(1);

    act(() => jest.advanceTimersByTime(5999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows nothing without a message', async () => {
    await render(<Toast message={undefined} onDismiss={jest.fn()} bottomOffset={0} />);

    expect(screen.queryByText(message)).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  // The post-it mounts already holding its words, and an Android live region
  // speaks a change to a node that is there, not a node that arrives — so it
  // says each message itself, once, with the action it offers.
  it('announces each message once, with its action, as it appears', async () => {
    const action = { label: undoLabel, onPress: jest.fn() };
    const toast = (text: string | undefined) => (
      <Toast message={text} action={action} onDismiss={jest.fn()} bottomOffset={0} />
    );
    const view = await render(toast(message));

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith(`${message}, ${undoLabel}`, { queue: true });

    await view.rerender(toast(message));
    expect(announce).toHaveBeenCalledTimes(1);

    const next = '앨범에 저장했어요.'; // 앨범에 저장했어요.
    await view.rerender(toast(next));
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith(`${next}, ${undoLabel}`, { queue: true });

    await view.rerender(toast(undefined));
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('announces only its words when it offers no action', async () => {
    await render(<Toast message={message} onDismiss={jest.fn()} bottomOffset={0} />);

    expect(announce).toHaveBeenCalledWith(message, { queue: true });
  });
});
