import * as WebBrowser from 'expo-web-browser';

import { API_BASE_URL } from './api';

/**
 * The terms and the privacy policy, as the API serves them
 * (`apps/api/src/routes/legal.ts`, spec ACC-12). The app keeps no copy, so a
 * fix to a document reaches every install without a release. The sign-in
 * screen's fine print and the 나 tab's two rows open the same pages, so the
 * addresses are built here once.
 *
 * Null without an API origin: a dev build on the in-code mock has no server to
 * serve them, and a link that cannot open is not offered.
 */
export function legalDocumentUrls(): { terms: string; privacy: string } | null {
  const origin = API_BASE_URL.replace(/\/$/, '');
  return origin ? { terms: `${origin}/legal/terms`, privacy: `${origin}/legal/privacy` } : null;
}

/** Opens a document in the in-app browser, over the app rather than out of it. */
export function openLegalDocument(url: string) {
  // The browser module refuses a second page while one is still opening (a
  // quick double tap); the first one is what the user asked for.
  WebBrowser.openBrowserAsync(url).catch(() => {});
}
