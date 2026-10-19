import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { AlertCard, NoticeBand } from './notice';

const saveFailed = '스냅 1개를 올리지 못했어요.'; // 스냅 1개를 올리지 못했어요.
const loadFailed = '무비를 불러오지 못했어요.'; // 무비를 불러오지 못했어요.

const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

beforeEach(() => {
  announce.mockClear();
});

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

  // A band that stands with the screen is read where it sits.
  it('stays quiet by default and keeps its polite live region', async () => {
    const view = await render(<NoticeBand message="만드는 동안에는 컷을 고칠 수 없어요." />);

    expect(announce).not.toHaveBeenCalled();
    expect(view.root?.props.accessibilityLiveRegion).toBe('polite');
  });

  // A refusal that answers a press mounts holding its words, like an AlertCard.
  it('announces a refusal when asked, without a live region to say it twice', async () => {
    const refused = '프로페셔널 계정만 연결할 수 있어요.'; // 프로페셔널 계정만 연결할 수 있어요.
    const view = await render(<NoticeBand message={refused} announce />);

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith(refused);
    expect(view.root?.props.accessibilityLiveRegion).toBeUndefined();
  });
});

describe('AlertCard', () => {
  it('shows the failure and the way out', async () => {
    const onPress = jest.fn();
    await render(<AlertCard message={saveFailed} action={{ label: '다시 올리기', onPress }} />);

    await fireEvent.press(screen.getByRole('button', { name: '다시 올리기' }));

    expect(screen.getByText(saveFailed)).toBeOnTheScreen();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // Every caller mounts the card with its error, and an Android live region
  // speaks a change to a node that is there, not a node that arrives holding
  // its words: the card says its error itself, and only when it is news.
  it('announces its error when it appears and when the error changes', async () => {
    const view = await render(<AlertCard message={saveFailed} />);

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith(saveFailed);
    expect(view.root?.props.accessibilityLiveRegion).toBeUndefined();

    await view.rerender(<AlertCard message={saveFailed} />);
    expect(announce).toHaveBeenCalledTimes(1);

    await view.rerender(<AlertCard message={loadFailed} />);
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith(loadFailed);
  });

  it('stays quiet when it is a standing state', async () => {
    const view = await render(<AlertCard message={saveFailed} announce={false} />);

    expect(announce).not.toHaveBeenCalled();
    expect(view.root?.props.accessibilityLiveRegion).toBe('polite');
  });
});
