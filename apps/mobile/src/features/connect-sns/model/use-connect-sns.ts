import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';

import { snsConnectionQueries, type SnsPlatform } from '@/entities/sns-connection';

import { disconnectSns } from '../api/disconnect-sns';
import { getConnectUrl } from '../api/get-connect-url';
import { ConnectMessages, SnsPlatformNames } from '../lib/connect-copy';
import { readConnectResult, SnsReturnUrl } from '../lib/connect-result';

export type ConnectSnsActions = {
  /** Runs the platform's approval in the browser. Resolves whether the link was made. */
  connect: (platform: SnsPlatform) => Promise<boolean>;
  /** Removes the link. Resolves whether it took. */
  disconnect: (platform: SnsPlatform) => Promise<boolean>;
  pending: 'connect' | 'disconnect' | null;
  error: string | null;
};

/**
 * Linking and unlinking a social account (SNS-1).
 *
 * The approval runs in an in-app browser session, the way sign-in's Google
 * consent does: the backend sends the browser back to `snaplyapp://sns/…`, and
 * the session hands that URL back here to read in place. On Android the link can
 * reach the app as an incoming URL instead, with the session ending as a
 * dismissal, so the link heard while the session is open counts as its answer.
 * Closing the browser with no link is not a failure and says nothing. Either outcome re-reads the account's links,
 * so every screen showing one moves at once.
 */
export function useConnectSns(): ConnectSnsActions {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<'connect' | 'disconnect' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: snsConnectionQueries.all() });

  async function connect(platform: SnsPlatform): Promise<boolean> {
    if (pending) return false;
    setPending('connect');
    setError(null);
    const name = SnsPlatformNames[platform];
    try {
      const authorizeUrl = await getConnectUrl(platform);
      let heard: string | null = null;
      const listener = Linking.addEventListener('url', ({ url }) => {
        if (url.startsWith(SnsReturnUrl)) heard = url;
      });
      let session: WebBrowser.WebBrowserAuthSessionResult;
      try {
        session = await WebBrowser.openAuthSessionAsync(authorizeUrl, SnsReturnUrl);
      } finally {
        listener.remove();
      }
      const returned = session.type === 'success' ? session.url : heard;
      if (!returned) return false; // closed by the user — silent
      const result = readConnectResult(returned);
      if (result.kind === 'connected') {
        await refresh();
        return true;
      }
      setError(
        result.kind === 'personal-account'
          ? ConnectMessages.personalAccount(name)
          : ConnectMessages.failed(name),
      );
      return false;
    } catch {
      setError(ConnectMessages.failed(name));
      return false;
    } finally {
      setPending(null);
    }
  }

  async function disconnect(platform: SnsPlatform): Promise<boolean> {
    if (pending) return false;
    setPending('disconnect');
    setError(null);
    try {
      await disconnectSns(platform);
      await refresh();
      return true;
    } catch {
      setError(ConnectMessages.disconnectFailed(SnsPlatformNames[platform]));
      return false;
    } finally {
      setPending(null);
    }
  }

  return { connect, disconnect, pending, error };
}
