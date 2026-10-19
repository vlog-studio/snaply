import { fireEvent, render, screen } from '@testing-library/react-native';

import { Colors, ThemeScope } from '@/shared/ui/theme';

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

  // A disabled button loses its pink band, so its words sit on the paper
  // itself: sticker ink there was dark on dark at night (취소 while a delete
  // runs, 다시 시도 while a retry starts).
  it('writes a disabled label in the paper’s own ink, readable at night', async () => {
    await render(
      <ThemeScope scheme="dark">
        <TextButton label="취소" disabled onPress={jest.fn()} />
      </ThemeScope>,
    );

    expect(screen.getByText('취소')).toHaveStyle({ color: Colors.dark.text });
  });

  // A delete that is only a word is ink on a kraft band — not red, and not the
  // pink of every other text button.
  it('marks a delete in kraft', async () => {
    await render(<TextButton label="삭제" tone="delete" onPress={jest.fn()} />);

    expect(screen.getByText('삭제')).toHaveStyle({
      color: Colors.light.stickerInk,
      backgroundColor: Colors.light.kraft,
    });
  });
});
