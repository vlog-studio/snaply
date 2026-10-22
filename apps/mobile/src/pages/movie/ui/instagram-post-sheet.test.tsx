import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { InstagramPostStep } from './instagram-post-sheet';

jest.mock('@/entities/sns-connection', () => ({
  // No link yet: the step shows the connect prompt with the hand-off row under it.
  useSnsConnection: () => ({ connection: undefined, isLoaded: true, isError: false }),
  needsReconnect: () => false,
}));
let mockConnectError: string | null = null;
jest.mock('@/features/connect-sns', () => ({
  useConnectSns: () => ({ connect: jest.fn(), pending: null, error: mockConnectError }),
}));
jest.mock('@/features/post-to-instagram', () => ({ PostToInstagramConfirm: () => null }));
// Only the wording is read here; the real module pulls in the native album API.
// Any other outcome reads as a marked line, so a tap that should say nothing
// shows up if it says something.
jest.mock('@/features/share-movie', () => ({
  InstagramHandoffMessages: new Proxy(
    {},
    {
      get: (_, outcome) =>
        outcome === 'failed'
          ? '무비를 앨범에 저장하지 못했어요. 다시 시도해 주세요.'
          : `message:${String(outcome)}`,
    },
  ),
}));

function renderStep(outcome: 'opened' | 'failed' | 'busy' | 'resolving') {
  const onCancel = jest.fn();
  const onHandedOff = jest.fn();
  const view = render(
    <InstagramPostStep
      movieId="m1"
      title="무비"
      videoId="v1"
      onCancel={onCancel}
      onHandedOff={onHandedOff}
      onPosted={jest.fn()}
      onOpenInstagramApp={async () => outcome}
      handingOff={false}
    />,
  );
  return { onCancel, onHandedOff, view };
}

// The link's failure, as connect-sns words it.
const connectFailure = 'Instagram에 연결하지 못했어요. 다시 시도해 주세요.';

describe('InstagramPostStep', () => {
  afterEach(() => {
    mockConnectError = null;
  });

  // In the ⋯ sheet "cancel" means back to the menu, so a hand-off that called it
  // left the ⋯ menu open behind Instagram (2026-10-13 review).
  it('finishes the sheet once Instagram opens, without stepping back', async () => {
    const { onCancel, onHandedOff, view } = renderStep('opened');
    await view;

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Instagram 앱에서 올리기' }));
    });

    expect(onHandedOff).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('stays with the reason when the movie could not be saved', async () => {
    const { onCancel, onHandedOff, view } = renderStep('failed');
    await view;

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Instagram 앱에서 올리기' }));
    });

    expect(onHandedOff).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(
      screen.getByText('무비를 앨범에 저장하지 못했어요. 다시 시도해 주세요.'),
    ).toBeOnTheScreen();
  });

  // A second tap while one hand-off runs is ignored — it used to read as a
  // failed save over the one still going (2026-10-14 review, backlog E-53).
  it('says nothing for a tap while a hand-off is already running', async () => {
    const { onCancel, onHandedOff, view } = renderStep('busy');
    await view;

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Instagram 앱에서 올리기' }));
    });

    expect(screen.queryByText('무비를 앨범에 저장하지 못했어요. 다시 시도해 주세요.')).toBeNull();
    expect(onHandedOff).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  // The file's address was still on its way, and the hand-off said a finished
  // movie had never been finished (2026-10-19 review, MOVIE-3).
  it('says nothing for a tap before the movie’s address has arrived', async () => {
    const { onCancel, onHandedOff, view } = renderStep('resolving');
    await view;

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Instagram 앱에서 올리기' }));
    });

    expect(screen.queryByText(/^message:/)).toBeNull();
    expect(onHandedOff).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  // Both inline lines mount already holding their words, which an Android live
  // region does not read out, so a failed save or a failed link went
  // unannounced (2026-10-19 review, MOVIE-8).
  it('says a failed save to a screen reader as it arrives', async () => {
    // The React Native preset already mocks it, so the spy carries earlier tests' calls.
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();
    const { view } = renderStep('failed');
    await view;
    expect(announce).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Instagram 앱에서 올리기' }));
    });

    expect(announce).toHaveBeenCalledWith('무비를 앨범에 저장하지 못했어요. 다시 시도해 주세요.');
    announce.mockRestore();
  });

  it('says the link’s failure to a screen reader', async () => {
    // The React Native preset already mocks it, so the spy carries earlier tests' calls.
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();
    mockConnectError = connectFailure;
    const { view } = renderStep('failed');
    await view;

    expect(screen.getByText(connectFailure)).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith(connectFailure);
    announce.mockRestore();
  });
});
