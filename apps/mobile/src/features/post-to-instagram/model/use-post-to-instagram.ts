import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useFinishMovie } from '@/entities/movie';
import { snsConnectionQueries } from '@/entities/sns-connection';

import { postMovieToInstagram, type PostOutcome } from '../api/post-movie';

/** The cap Instagram puts on a Reel's caption, and the contract's. */
export const CaptionMaxLength = 2200;

const PostErrorMessage = 'Instagram에 게시하지 못했어요. 다시 시도해 주세요.';

export type InstagramPosting = {
  /** Resolves how the post ended, or `undefined` when it did not go through. */
  post: (params: {
    movieId: string;
    videoId: string;
    caption: string;
  }) => Promise<PostOutcome | undefined>;
  busy: boolean;
  error: string | null;
};

/**
 * Posting a finished movie to Instagram (SNS-4, SNS-8).
 *
 * A post that went through finishes the movie — the server deletes its file
 * there (MOV-17) — so the store is told at once rather than on the next read,
 * and watch mode, which shows that file, gives way. One that is still
 * processing on Instagram's side finishes nothing here: the server finishes it
 * only once it is published. A failure leaves the movie as it was, and re-reads
 * the link, since an expired one is the likeliest cause and the screen should
 * offer 다시 연결 rather than another doomed try.
 */
export function usePostToInstagram(): InstagramPosting {
  const queryClient = useQueryClient();
  const recordFinished = useFinishMovie();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post({
    movieId,
    videoId,
    caption,
  }: {
    movieId: string;
    videoId: string;
    caption: string;
  }): Promise<PostOutcome | undefined> {
    if (busy) return undefined;
    setBusy(true);
    setError(null);
    try {
      const outcome = await postMovieToInstagram({ videoId, caption: caption.trim() || undefined });
      if (outcome === 'posted') recordFinished(movieId, Date.now());
      return outcome;
    } catch {
      setError(PostErrorMessage);
      void queryClient.invalidateQueries({ queryKey: snsConnectionQueries.all() });
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  return { post, busy, error };
}
