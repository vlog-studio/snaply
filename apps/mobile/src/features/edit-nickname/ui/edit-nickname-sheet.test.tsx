import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { EditNicknameSheet } from './edit-nickname-sheet';

// The sheet reads the safe-area insets; fixed metrics let them resolve.
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const mockUpdate = jest.fn<Promise<string | null>, [string]>();
jest.mock('../api/nickname-api', () => ({
  getNickname: jest.fn(),
  updateNickname: (nickname: string) => mockUpdate(nickname),
}));

async function renderSheet() {
  const onClose = jest.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={queryClient}>
        <EditNicknameSheet visible name="다연" onClose={onClose} />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EditNicknameSheet', () => {
  it('keeps the sheet and the typed name when the save fails', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('500'));
    const { onClose } = await renderSheet();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: '저장' }));
    });

    expect(
      await screen.findByText('이름을 저장하지 못했어요. 다시 시도해 주세요.'),
    ).toBeOnTheScreen();
    expect(screen.getByDisplayValue('다연')).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });

  // The button is disabled while saving but the keyboard's done key was not, so
  // a quick second press sent a second PATCH (2026-10-14 review, backlog E-56).
  it('saves once however fast the done key is pressed again', async () => {
    let finish!: (saved: string) => void;
    mockUpdate.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const { onClose } = await renderSheet();
    const field = screen.getByDisplayValue('다연');

    await act(async () => {
      fireEvent(field, 'submitEditing');
      fireEvent(field, 'submitEditing');
    });
    await act(async () => finish('다연'));

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
