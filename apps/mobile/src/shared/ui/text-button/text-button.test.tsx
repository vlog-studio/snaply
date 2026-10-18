import { fireEvent, render, screen } from '@testing-library/react-native';

import { TextButton } from './text-button';

describe('TextButton', () => {
  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    await render(<TextButton label="다시 넣기" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: '다시 넣기' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled, and says so', async () => {
    const onPress = jest.fn();
    await render(<TextButton label="다시 넣기" disabled onPress={onPress} />);

    const button = screen.getByRole('button', { name: '다시 넣기' });
    await fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });
});
