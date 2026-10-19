import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { NotFoundPage } from './not-found-page';

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = false;

// Back goes through the screen's own navigator (as the hardware back does);
// only a cold link with nothing behind it replaces into the studio.
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useNavigation: () => ({ goBack: mockBack, canGoBack: () => mockCanGoBack }),
}));

/** The back bar pads itself by the status bar, so it needs metrics to render at all. */
const ScreenMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={ScreenMetrics}>
      <NotFoundPage />
    </SafeAreaProvider>,
  );

describe('NotFoundPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack = false;
  });

  it('says the page is missing and opens the studio when the link opened the app', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: '페이지를 찾을 수 없어요' })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: '돌아가기' }));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  // Closing this screen and switching tabs in one navigation threw in
  // Android's view mounting; over the app the ticket only goes back.
  it('goes back to where the user was when the link opened over the app', async () => {
    await renderScreen();
    // The stack grows after the first render of a deep link: decided at the press.
    mockCanGoBack = true;

    fireEvent.press(screen.getByRole('button', { name: '돌아가기' }));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('goes back on the back bar too', async () => {
    mockCanGoBack = true;
    await renderScreen();

    fireEvent.press(screen.getByRole('button', { name: '뒤로 가기' }));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
