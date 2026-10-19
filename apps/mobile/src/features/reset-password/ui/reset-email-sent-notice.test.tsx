import { fireEvent, render, screen } from '@testing-library/react-native';

import { Colors } from '@/shared/ui/theme';

import { ResetEmailSentNotice } from './reset-email-sent-notice';

// The theme-mode store persists through SecureStore.
jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

const resendLabel = '재설정 메일 다시 보내기';

describe('ResetEmailSentNotice', () => {
  // The resend is the only thing this state offers; it must read as an action,
  // not as one more line of the notice.
  it('offers the resend as a highlighted text button that re-sends', async () => {
    const onResend = jest.fn();
    await render(
      <ResetEmailSentNotice email="a@b.co" onResend={onResend} isPending={false} error={null} />,
    );

    expect(screen.getByText(resendLabel)).toHaveStyle({ backgroundColor: Colors.light.pink });
    await fireEvent.press(screen.getByRole('button', { name: resendLabel }));

    expect(onResend).toHaveBeenCalledTimes(1);
  });

  it('holds the resend while one is on its way', async () => {
    const onResend = jest.fn();
    await render(
      <ResetEmailSentNotice email="a@b.co" onResend={onResend} isPending error={null} />,
    );

    const resend = screen.getByRole('button', { name: resendLabel });
    await fireEvent.press(resend);

    expect(resend).toBeDisabled();
    expect(onResend).not.toHaveBeenCalled();
  });
});
