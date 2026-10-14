/**
 * How long the server keeps a movie's result file when the user never finishes
 * it (MOV-16) — the backend's `MOVIE_RESULT_RETENTION_DAYS`. The app has no
 * field for the deadline, so every surface counts it from the render.
 */
export const MovieResultRetentionDays = 30;

/** Inside this many days a surface counts down — the window of the server's D-3 notice (NTF-10). */
export const MovieResultCountdownDays = 3;

const DayMs = 24 * 60 * 60 * 1000;

/** When an unfinished result is purged, counted from `renderedAt`. */
export function movieResultExpiresAt(renderedAt: number): number {
  return renderedAt + MovieResultRetentionDays * DayMs;
}
