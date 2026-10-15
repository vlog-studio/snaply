import { downloadRenderFile } from './download-render-file';

const mockDownloadFileAsync = jest.fn<
  Promise<{ move: (to: unknown) => Promise<void> }>,
  [string]
>();

// A minimal file system: nothing is cached yet, and a download hands back a
// file that can be moved into place.
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  Directory: class {
    create() {}
  },
  File: class {
    static downloadFileAsync(uri: string) {
      return mockDownloadFileAsync(uri);
    }
    readonly exists = false;
    readonly uri: string;
    constructor(_directory: unknown, name: string) {
      this.uri = `file:///cache/share-movie/${name}`;
    }
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('downloadRenderFile', () => {
  // 공유 and the Instagram hand-off wrote the same `.part` file, so running both
  // at once broke one of them (2026-10-14 review, backlog E-53).
  it('downloads a render once while two callers ask for it', async () => {
    let finish!: () => void;
    mockDownloadFileAsync.mockReturnValueOnce(
      new Promise((resolve) => (finish = () => resolve({ move: async () => undefined }))),
    );

    const first = downloadRenderFile('https://cdn/e.mp4?sig=a', 'm1-42');
    const second = downloadRenderFile('https://cdn/e.mp4?sig=b', 'm1-42');
    finish();

    await expect(Promise.all([first, second])).resolves.toEqual([
      'file:///cache/share-movie/m1-42.mp4',
      'file:///cache/share-movie/m1-42.mp4',
    ]);
    expect(mockDownloadFileAsync).toHaveBeenCalledTimes(1);
  });

  it('downloads again after a failed attempt', async () => {
    mockDownloadFileAsync
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ move: async () => undefined });

    await expect(downloadRenderFile('https://cdn/e.mp4', 'm1-43')).rejects.toThrow('offline');
    await expect(downloadRenderFile('https://cdn/e.mp4', 'm1-43')).resolves.toBe(
      'file:///cache/share-movie/m1-43.mp4',
    );
  });
});
