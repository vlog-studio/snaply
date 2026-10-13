import { getRecommendedStyle } from './recommended-style';

const mockApiRequest = jest.fn();

jest.mock('@/shared/config/api', () => ({ USE_MOCK_API: false }));
jest.mock('@/shared/api', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

beforeEach(() => jest.clearAllMocks());

describe('getRecommendedStyle', () => {
  it('reads the server preset as the app style', async () => {
    mockApiRequest.mockResolvedValue({ recommendedStyle: '여행' });

    await expect(getRecommendedStyle()).resolves.toBe('travel');
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/auth/me',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('is none when the server recommends nothing, or is too old to say', async () => {
    mockApiRequest.mockResolvedValue({ recommendedStyle: null });
    await expect(getRecommendedStyle()).resolves.toBeNull();

    mockApiRequest.mockResolvedValue({});
    await expect(getRecommendedStyle()).resolves.toBeNull();
  });
});
