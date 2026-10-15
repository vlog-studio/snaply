import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { InstagramPostStep } from './instagram-post-sheet';

jest.mock('@/entities/sns-connection', () => ({
  // No link yet: the step shows the connect prompt with the hand-off row under it.
  useSnsConnection: () => ({ connection: undefined, isLoaded: true, isError: false }),
  needsReconnect: () => false,
}));
jest.mock('@/features/connect-sns', () => ({
  useConnectSns: () => ({ connect: jest.fn(), pending: null, error: null }),
}));
jest.mock('@/features/post-to-instagram', () => ({ PostToInstagramConfirm: () => null }));
// Only the wording is read here; the real module pulls in the native album API.
jest.mock('@/features/share-movie', () => ({
  InstagramHandoffMessages: { failed: '무비를 앨범에 저장하지 못했어요. 다시 시도해 주세요.' },
}));

function renderStep(outcome: 'opened' | 'failed' | 'busy') {
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

describe('InstagramPostStep', () => {
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
});
