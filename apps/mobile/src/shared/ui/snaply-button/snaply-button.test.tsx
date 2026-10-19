import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Colors } from '@/shared/ui/theme';

import { SnaplyButton } from './snaply-button';

describe('SnaplyButton', () => {
  const buttonTitle = '촬영 시작';

  it('calls onPress when the user presses the button', async () => {
    const onPress = jest.fn();
    await render(<SnaplyButton title={buttonTitle} onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: buttonTitle }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    await render(<SnaplyButton disabled title={buttonTitle} onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: buttonTitle }));

    expect(onPress).not.toHaveBeenCalled();
  });

  // The VOID stamp is a drawing on the kraft face, not a word of the label: a
  // danger ticket with no label of its own was read as "삭제 VOID".
  it('names a danger ticket by its title alone, without the VOID stamp', async () => {
    const onPress = jest.fn();
    await render(<SnaplyButton variant="danger" title="삭제" onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: '삭제' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // The stamp sits in a fixed margin beside the label; a system text size that
  // grew it would run it over the words.
  it('prints the VOID stamp at its drawn size whatever the system text size', async () => {
    await render(<SnaplyButton variant="danger" title="삭제" />);

    expect(screen.getByText('VOID', { includeHiddenElements: true })).toHaveProp(
      'allowFontScaling',
      false,
    );
  });

  // The notched ticket is drawn to its measured size. Before the first layout
  // pass (which Jest never delivers) the face must still be there as a plain
  // rectangle — a white label on bare paper was unreadable for that frame.
  it('draws its face before the ticket is measured', async () => {
    await render(<SnaplyButton title="생성" />);

    const faces: unknown[] = [];
    const walk = (node: ReturnType<typeof screen.toJSON> | string): void => {
      if (!node || typeof node === 'string') return;
      if (
        node.type === 'View' &&
        StyleSheet.flatten(node.props.style)?.backgroundColor === Colors.light.primary
      ) {
        faces.push(node);
      }
      node.children?.forEach(walk);
    };
    walk(screen.toJSON());
    expect(faces.length).toBeGreaterThan(0);
  });
});
