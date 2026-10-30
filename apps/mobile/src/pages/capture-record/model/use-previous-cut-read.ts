import { useQuery } from '@tanstack/react-query';

import { useAnalysisConsent } from '@/features/analysis-consent';
import { USE_MOCK_API } from '@/shared/config/api';

import { readPreviousCut, type PreviousCutRead } from '../api/read-previous-cut';

/**
 * The AI's reading of the previous cut (SNAP-25), asked once per cut and only
 * for an account that agreed to snap analysis. Every failure — no consent, the
 * server's switch off, a slow or odd answer — is `undefined`, and the guide
 * falls back to its own line (capture-coach §6).
 */
export function usePreviousCutRead(
  snapId: string | undefined,
  frameUri: string | undefined,
): PreviousCutRead | undefined {
  const consent = useAnalysisConsent();
  const query = useQuery({
    queryKey: ['capture-coach', 'previous-cut', snapId] as const,
    queryFn: ({ signal }) => readPreviousCut(frameUri ?? '', signal),
    enabled:
      !USE_MOCK_API &&
      snapId !== undefined &&
      frameUri !== undefined &&
      consent.available &&
      consent.granted,
    // A cut's closing frame never changes, so neither does its reading.
    staleTime: Infinity,
    // A failed reading is not worth a second wait at the viewfinder.
    retry: false,
  });
  return query.data;
}
