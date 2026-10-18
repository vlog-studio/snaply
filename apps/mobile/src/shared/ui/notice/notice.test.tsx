import { fireEvent, render, screen } from '@testing-library/react-native';

import { AlertCard, NoticeBand } from './notice';

describe('NoticeBand', () => {
  it('shows the message, its action and a dismiss', async () => {
    const onPress = jest.fn();
    const onDismiss = jest.fn();
    await render(
      <NoticeBand
        message="스냅 2개는 넣지 않았어요"
        action={{ label: '다시 넣기', accessibilityLabel: '넣지 않은 스냅 2개 다시 넣기', onPress }}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText('스냅 2개는 넣지 않았어요')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '넣지 않은 스냅 2개 다시 넣기' }));
    await fireEvent.press(screen.getByRole('button', { name: '알림 닫기' }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('draws no action or dismiss it was not given', async () => {
    await render(<NoticeBand message="만드는 동안에는 컷을 고칠 수 없어요." />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('AlertCard', () => {
  it('shows the failure and the way out', async () => {
    const onPress = jest.fn();
    await render(
      <AlertCard
        message="스냅 1개를 올리지 못했어요."
        action={{ label: '다시 올리기', onPress }}
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: '다시 올리기' }));

    expect(screen.getByText('스냅 1개를 올리지 못했어요.')).toBeOnTheScreen();
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
