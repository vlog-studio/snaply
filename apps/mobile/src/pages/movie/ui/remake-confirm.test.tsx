import { fireEvent, render, screen } from '@testing-library/react-native';

import { RemakeConfirm } from './remake-confirm';

describe('RemakeConfirm', () => {
  // Remaking drops the finished movie and is paid again (MOV-23), so the line
  // says both before the confirming tap.
  it('says what a remake costs', async () => {
    await render(<RemakeConfirm onConfirm={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByText('지금 완성된 무비는 사라지고, 크레딧을 다시 써요.')).toBeOnTheScreen();
  });

  it('remakes only on the confirming tap', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(<RemakeConfirm onConfirm={onConfirm} onCancel={onCancel} />);

    await fireEvent.press(screen.getByRole('button', { name: '그대로 두기' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button', { name: '다시 만들기' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
