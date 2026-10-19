import { fireEvent, render, screen } from '@testing-library/react-native';

import { RootErrorBoundary } from './root-error-boundary';

describe('RootErrorBoundary', () => {
  // Without it a render error that no screen catches closes the release app.
  it('says the screen did not open and draws it again on 다시 시도', async () => {
    const retry = jest.fn(() => Promise.resolve());
    await render(<RootErrorBoundary error={new Error('render failed')} retry={retry} />);

    expect(screen.getByText('화면을 열지 못했어요')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
