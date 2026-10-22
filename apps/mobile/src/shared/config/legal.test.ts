import * as WebBrowser from 'expo-web-browser';

import { legalDocumentUrls, openLegalDocument } from './legal';

// The documents are pages on the API origin (spec ACC-12).
let mockApiBaseUrl = 'https://api.example.test';
// A getter, so a test can change the origin after the module has been read.
jest.mock('@/shared/config/api', () => ({
  get API_BASE_URL() {
    return mockApiBaseUrl;
  },
}));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockApiBaseUrl = 'https://api.example.test';
});

describe('legalDocumentUrls', () => {
  it.each([
    ['https://api.example.test', 'without a trailing slash'],
    ['https://api.example.test/', 'with a trailing slash, not doubling it'],
  ])('builds both addresses from %s (%s)', (origin) => {
    mockApiBaseUrl = origin;

    expect(legalDocumentUrls()).toEqual({
      terms: 'https://api.example.test/legal/terms',
      privacy: 'https://api.example.test/legal/privacy',
    });
  });

  // A dev build on the in-code mock has no server to serve them, so neither
  // the fine print nor the 나 tab offers a link that cannot open.
  it('offers no address without an API origin', () => {
    mockApiBaseUrl = '';

    expect(legalDocumentUrls()).toBeNull();
  });
});

describe('openLegalDocument', () => {
  it('opens the page in the in-app browser', () => {
    openLegalDocument('https://api.example.test/legal/privacy');

    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      'https://api.example.test/legal/privacy',
    );
  });

  // A quick double tap is refused by the browser module while the first page
  // opens; that refusal must not surface as an unhandled rejection.
  it('swallows a refused second opening', async () => {
    jest
      .mocked(WebBrowser.openBrowserAsync)
      .mockRejectedValueOnce(new Error('Another WebBrowser is already being presented.'));

    expect(() => openLegalDocument('https://api.example.test/legal/terms')).not.toThrow();
    await Promise.resolve();
  });
});
