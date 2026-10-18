import type { MovieStatus } from '@/entities/movie';
import { Tag, type TagTone } from '@/shared/ui/tag';

export const MovieStatusLabels: Record<MovieStatus, string> = {
  draft: '초안',
  generating: '만드는 중',
  ready: '완성',
  failed: '실패',
};

export type MovieStatusBadgeProps = {
  status: MovieStatus;
};

/**
 * Where a movie stands, as a tag (the design system's `jj-tag`): a square of
 * sticker colour with dark ink — 초안 sheet, 만드는 중 sky, 완성 mint — and the
 * one failure in cherry with white. Shared by the board row and the grid tile
 * so a status reads as the same word and colour wherever a movie is drawn.
 * Sticker colours keep their value at night, so the ink does too.
 */
export function MovieStatusBadge({ status }: MovieStatusBadgeProps) {
  return <Tag label={MovieStatusLabels[status]} tone={StatusTones[status]} />;
}

const StatusTones: Record<MovieStatus, TagTone> = {
  draft: 'sheet',
  generating: 'sky',
  ready: 'mint',
  failed: 'cherry',
};
