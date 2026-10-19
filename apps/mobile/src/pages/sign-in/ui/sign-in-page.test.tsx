import { fireEvent, render, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';

import { SignInPage } from './sign-in-page';

// The quiet links route elsewhere; what is under test here is the fine print.
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: ReactNode }) => children,
}));

// The page pads for the status bar through SafeAreaView — a native answer a
// test has no provider for.
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});

// The theme-mode store persists through SecureStore.
jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

// The forms run Supabase; they have tests of their own.
jest.mock('@/features/sign-in', () => ({
  EmailSignInForm: () => null,
  SocialLoginList: () => null,
}));

// The legal documents are pages on the API origin (spec ACC-12); a dev build
// without one offers no link.
let mockApiBaseUrl = 'https://api.example.test';
// A getter, so a test can change it after the module has been read.
jest.mock('@/shared/config/api', () => ({
  get API_BASE_URL() {
    return mockApiBaseUrl;
  },
}));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })),
}));

const finePrint = '계속하면 서비스 이용약관과 개인정보 처리방침에 동의하게 돼요.';

describe('SignInPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiBaseUrl = 'https://api.example.test';
  });

  // Agreeing by continuing holds only if the documents agreed to can be read
  // from the sentence that says so.
  it.each([
    ['서비스 이용약관', 'https://api.example.test/legal/terms'],
    ['개인정보 처리방침', 'https://api.example.test/legal/privacy'],
  ])('opens %s from the fine print in the in-app browser', async (label, url) => {
    await render(<SignInPage />);

    expect(screen.getByText(finePrint)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('link', { name: label }));

    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(url);
  });

  // How the address is built is the shared helper's own test
  // (`shared/config/legal.test.ts`); here, that the page offers no link that
  // cannot open.
  it('prints the same sentence without links when there is no API origin', async () => {
    mockApiBaseUrl = '';
    await render(<SignInPage />);

    expect(screen.getByText(finePrint)).toBeOnTheScreen();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
