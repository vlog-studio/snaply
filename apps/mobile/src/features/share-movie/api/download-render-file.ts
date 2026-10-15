import { Directory, File, Paths } from 'expo-file-system';

/**
 * Where downloaded renders wait for the share sheet. Under the cache root on
 * purpose: the OS may reclaim it, and everything here can be re-downloaded —
 * the server keeps the render, this is only the local copy sharing needs.
 */
const shareCacheDirectory = new Directory(Paths.cache, 'share-movie');

/**
 * Bring a render's file local, for handing to the share sheet.
 *
 * `expo-sharing` accepts local files only — an `https://` URL passed through
 * is a failed share — so a remote render is downloaded to the cache first and
 * the local path is what gets shared. A `uri` that is already local (mock
 * mode never produces one, but a future local render might) passes through
 * untouched.
 *
 * `cacheKey` names the local copy, so it must identify the render *version* —
 * the caller keys it on the movie and its `renderedAt`. The remote URL cannot
 * be the name: it is a signed link whose query changes on every resolution
 * while pointing at the same bytes. A key already on disk is reused without
 * touching the network, which is what makes sharing twice instant.
 *
 * Downloaded to a `.part` name and renamed only when complete, so a download
 * that dies half-way (app killed, network dropped) can never leave a file
 * that a later share would hand out as if it were whole.
 */
export function downloadRenderFile(uri: string, cacheKey: string): Promise<string> {
  if (!/^https?:\/\//.test(uri)) return Promise.resolve(uri);
  // One download per render at a time: 공유 and the Instagram hand-off write the
  // same `.part` file, so two at once broke one of them (backlog E-53).
  const running = inFlight.get(cacheKey);
  if (running) return running;
  const download = fetchToCache(uri, cacheKey).finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, download);
  return download;
}

const inFlight = new Map<string, Promise<string>>();

async function fetchToCache(uri: string, cacheKey: string): Promise<string> {
  shareCacheDirectory.create({ idempotent: true, intermediates: true });
  const local = new File(shareCacheDirectory, `${cacheKey}.mp4`);
  if (local.exists) return local.uri;

  const partial = new File(shareCacheDirectory, `${cacheKey}.part`);
  const downloaded = await File.downloadFileAsync(uri, partial, { idempotent: true });
  await downloaded.move(local);
  return local.uri;
}
