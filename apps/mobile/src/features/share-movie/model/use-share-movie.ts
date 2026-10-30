import { useRef, useState } from 'react';

import type { Movie } from '@/entities/movie';
import { requestAlbumPermission, saveVideoToAlbum } from '@/shared/lib/media-library';
import { canShareFiles, shareFile } from '@/shared/lib/sharing';

import { downloadRenderFile } from '../api/download-render-file';
import { openInstagram } from '../lib/open-instagram';

/**
 * Why a movie cannot be handed to the share sheet.
 *
 * `resolving` — the file's fresh address is still being asked for (up to an
 * 8-second deadline and one retry). Nothing is known yet, so nothing is said:
 * the control waits disabled with no reason under it. Read as `no-render`, the
 * wait told every finished movie, on every first visit, that it had never been
 * finished (2026-10-19 review, MOVIE-3).
 * `no-render` — there is no rendered file to share: the movie never produced
 * one (mock mode, or a render from before the backend composited anything).
 * `unresolved` — there **is** a file and its address could not be fetched
 * (2026-08-13). Two opposite situations arrive as the same empty `uri`, and
 * telling the user a finished movie was never finished is the worse of the two
 * lies; separating them also makes the fix sayable — one waits on a run, the
 * other on a connection.
 */
export type ShareBlock = 'resolving' | 'no-render' | 'unresolved';

/**
 * What each block says, so three surfaces cannot word the same rule
 * differently. A wait has no reason to state, so `resolving` says nothing —
 * read it through `shareBlockMessage`, which a surface can render as is.
 */
export const ShareBlockMessages: {
  readonly [Block in ShareBlock]: Block extends 'resolving' ? undefined : string;
} = {
  resolving: undefined,
  'no-render': '아직 완성된 무비가 없어서 공유할 수 없어요.',
  unresolved: '완성된 무비를 불러오지 못했어요. 연결을 확인해 주세요.',
};

/** The reason a surface states for a block — none while the address is still on its way. */
export function shareBlockMessage(block: ShareBlock | undefined): string | undefined {
  return block === undefined ? undefined : ShareBlockMessages[block];
}

/**
 * The rendered file as the caller has resolved it — structurally the shape
 * `useRenderSource` (`features/compose-movie`) returns, declared here rather
 * than imported so the two features stay uncoupled. The page that offers 공유
 * already resolves the render for playback; sharing must use the same fresh
 * address, because the stored one is a signed link that expires.
 */
export type ShareSource = {
  /** The file's address, fresh. `undefined` while resolving or when none exists. */
  uri: string | undefined;
  resolving: boolean;
  /** The address could not be fetched, though the movie has a file. */
  unresolved: boolean;
};

export type MovieSharing = {
  /** Set when sharing is unavailable; `undefined` when the sheet can open. */
  blocked: ShareBlock | undefined;
  /**
   * True from the press until the sheet opens — the file downloads to cache
   * first (`expo-sharing` takes local files only), and tens of MB are not
   * instant. The control disables on it; a second press mid-download is
   * ignored here too, so the guard does not live only in a `disabled` prop.
   */
  busy: boolean;
  /**
   * True when the last attempt could not produce a shareable local file —
   * the download failed, which offline is the expected way for this to end.
   * Cleared when a new attempt starts.
   */
  failed: boolean;
  /**
   * True once the share sheet has been opened on **this render** during this
   * visit. Not whether anything was saved — the sheet never says (a share is
   * "offered", never "confirmed") — only that the user has had the chance,
   * which is what makes it the moment to offer 끝내기 (MOV-17) without ever
   * calling it for them. Forgotten when the render changes.
   */
  offered: boolean;
  /** Opens the system share sheet on the rendered movie. */
  share: () => void;
  /**
   * Saves the rendered movie to the album and opens the Instagram app, for
   * posting there by hand — the way to Instagram that needs no Meta review
   * and no tester role (docs/decisions/instagram-app-handoff.md). Resolves how
   * it ended so the caller can keep its sheet open on a failure; `opened`
   * also counts as offered (the file is on the device now).
   */
  openInInstagram: () => Promise<InstagramHandoff>;
  /** True from that press until Instagram opens or the save fails. */
  handingOff: boolean;
  /**
   * Saves the rendered movie to the device album (MOV-15) — the way to keep
   * it on the phone, since Android's share sheet has no save target. Resolves
   * how it ended so the caller can say why it did not happen; `saved` also
   * counts as offered, and unlike a share the app knows the file landed.
   */
  saveToAlbum: () => Promise<AlbumSave>;
  /** True from that press until the save ends. */
  savingToAlbum: boolean;
  /** True once **this render** was saved to the album during this visit. */
  savedToAlbum: boolean;
};

/**
 * How a save to the album ended — the hand-off's cases minus opening Instagram.
 * `busy` and `resolving` are ignored taps and say nothing, as there.
 */
export type AlbumSave =
  'saved' | 'busy' | 'resolving' | 'blocked' | 'failed' | 'unavailable' | 'unresolved';

/** What the screen says when the save could not happen. */
export const AlbumSaveMessages: Record<
  Exclude<AlbumSave, 'saved' | 'busy' | 'resolving'>,
  string
> = {
  blocked: '무비를 앨범에 저장하려면 사진 권한이 필요해요.',
  failed: '무비를 앨범에 저장하지 못했어요. 다시 시도해 주세요.',
  unavailable: ShareBlockMessages['no-render'],
  unresolved: ShareBlockMessages.unresolved,
};

/**
 * How a hand-off to the Instagram app ended. `saved` — the movie is in the
 * album but Instagram did not open. `busy` — one was already running; the tap
 * is ignored and says nothing. `resolving` — the file's fresh address is still
 * on its way (`ShareBlock`'s `resolving`); the tap is ignored and says nothing
 * too, where it used to say a finished movie was never finished.
 */
export type InstagramHandoff =
  'opened' | 'saved' | 'busy' | 'resolving' | 'blocked' | 'failed' | 'unavailable' | 'unresolved';

/** What the sheet says when the hand-off could not happen. */
export const InstagramHandoffMessages: Record<
  Exclude<InstagramHandoff, 'opened' | 'busy' | 'resolving'>,
  string
> = {
  saved: '무비를 앨범에 저장했어요. Instagram 앱을 직접 열어 올려 주세요.',
  blocked: AlbumSaveMessages.blocked,
  failed: AlbumSaveMessages.failed,
  unavailable: AlbumSaveMessages.unavailable,
  unresolved: AlbumSaveMessages.unresolved,
};

/**
 * Exporting a finished movie through the OS share sheet.
 *
 * A feature rather than page code because two screens offer the same act: the
 * movie screen's 공유 button and the movie tab's selection bar.
 *
 * What is shared is the rendered file and nothing else. The cuts are the user's
 * own originals and the app will not quietly send one of those in a movie's
 * place — a share that hands over different material than the one the user asked
 * for is worse than a share that does not happen.
 *
 * The file is downloaded to the cache before the sheet opens, because
 * `expo-sharing` accepts local files only. The local copy is keyed on the
 * render version (movie id + `renderedAt`), so sharing the same render twice
 * downloads once, and a regenerated movie gets a fresh copy.
 *
 * Whether the platform has a share sheet is asked at press time rather than kept
 * in state: it is a constant for the session, and reading it on mount would put
 * an async answer behind a control whose real gate is the missing file.
 */
export function useShareMovie(movie: Movie | undefined, source: ShareSource): MovieSharing {
  const uri = source.uri;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // The render the sheet was last opened on, so the flag dies with the render.
  const [offeredFor, setOfferedFor] = useState<string>();
  const [handingOff, setHandingOff] = useState(false);
  const [savingToAlbum, setSavingToAlbum] = useState(false);
  // The render last saved to the album, so the flag dies with the render.
  const [savedFor, setSavedFor] = useState<string>();
  // The state above draws the controls; these decide, because a second tap can
  // land before the first one's render (2026-10-14 review, backlog E-53).
  const sharing = useRef(false);
  const handing = useRef(false);
  const saving = useRef(false);
  const renderKey = movie?.render ? `${movie.id}-${movie.render.renderedAt}` : undefined;

  const share = () => {
    if (!uri || !movie?.render || sharing.current) return;
    const render = movie.render;
    const key = `${movie.id}-${render.renderedAt}`;
    sharing.current = true;
    setBusy(true);
    setFailed(false);
    void (async () => {
      try {
        if (!(await canShareFiles())) return;
        const localUri = await downloadRenderFile(uri, key);
        await shareFile(localUri, {
          mimeType: 'video/mp4',
          uti: 'public.movie',
          dialogTitle: movie.title,
        });
        setOfferedFor(key);
      } catch (error) {
        setFailed(true);
        if (__DEV__) console.warn('[movie] share failed:', String(error));
      } finally {
        sharing.current = false;
        setBusy(false);
      }
    })();
  };

  // The same empty-`uri` cases as 공유 (`ShareBlock`): a finished movie whose
  // link is still on its way or could not be fetched must not be told it was
  // never finished.
  const albumTarget = ():
    { key: string; from: string } | 'unavailable' | 'resolving' | 'unresolved' => {
    if (!movie?.render) return 'unavailable';
    if (uri) return { key: `${movie.id}-${movie.render.renderedAt}`, from: uri };
    if (source.resolving) return 'resolving';
    return source.unresolved ? 'unresolved' : 'unavailable';
  };

  /** The render into the album — what 앨범에 저장 is, and the first half of the hand-off. */
  const putInAlbum = async (target: {
    key: string;
    from: string;
  }): Promise<'saved' | 'blocked'> => {
    const permission = await requestAlbumPermission();
    if (!permission.granted) return 'blocked';
    const localUri = await downloadRenderFile(target.from, target.key);
    await saveVideoToAlbum(localUri);
    // The file is the user's now — the same moment 공유 offers 끝내기 (MOV-17).
    setOfferedFor(target.key);
    return 'saved';
  };

  const saveToAlbum = async (): Promise<AlbumSave> => {
    const target = albumTarget();
    if (typeof target === 'string') return target;
    if (saving.current) return 'busy';
    saving.current = true;
    setSavingToAlbum(true);
    try {
      const outcome = await putInAlbum(target);
      if (outcome === 'saved') setSavedFor(target.key);
      return outcome;
    } catch (error) {
      if (__DEV__) console.warn('[movie] album save failed:', String(error));
      return 'failed';
    } finally {
      saving.current = false;
      setSavingToAlbum(false);
    }
  };

  const openInInstagram = async (): Promise<InstagramHandoff> => {
    const target = albumTarget();
    if (typeof target === 'string') return target;
    if (handing.current) return 'busy';
    handing.current = true;
    setHandingOff(true);
    try {
      try {
        if ((await putInAlbum(target)) === 'blocked') return 'blocked';
      } catch (error) {
        if (__DEV__) console.warn('[movie] instagram hand-off failed:', String(error));
        return 'failed';
      }
      try {
        await openInstagram();
        return 'opened';
      } catch (error) {
        // Saved is saved: say so, instead of that the save failed.
        if (__DEV__) console.warn('[movie] instagram did not open:', String(error));
        return 'saved';
      }
    } finally {
      handing.current = false;
      setHandingOff(false);
    }
  };

  const blocked: ShareBlock | undefined = uri
    ? undefined
    : source.resolving
      ? 'resolving'
      : source.unresolved
        ? 'unresolved'
        : 'no-render';

  return {
    blocked,
    busy,
    failed,
    offered: renderKey !== undefined && offeredFor === renderKey,
    share,
    openInInstagram,
    handingOff,
    saveToAlbum,
    savingToAlbum,
    savedToAlbum: renderKey !== undefined && savedFor === renderKey,
  };
}
