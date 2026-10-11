import { useEffect, useRef } from 'react';

import { useIsAuthenticated } from '@/entities/session';
import {
  configureForegroundNotifications,
  deleteFcmToken,
  dismissAllNotifications,
  ensureNotificationChannel,
  getFcmToken,
  hasNotificationPermission,
  onFcmTokenRefresh,
  onForegroundMessage,
  presentLocalNotification,
  registerForRemoteMessages,
} from '@/shared/lib/notifications';

import { registerFcmToken } from '../api/register-fcm-token';

/**
 * Acquire the device's FCM token and keep it registered with the backend.
 *
 * Runs only while authenticated, because `POST /auth/fcm-token` ties the token
 * to the current user. It only *checks* the notification grant — never prompts;
 * asking belongs to a control the user just touched (today, the 무비 완성 알림
 * switch), not to a background registrar at launch. Without the grant it does
 * nothing; `recheckKey` lets the app layer re-run the check when a grant may
 * have just landed. With the grant it registers with APNs (iOS), reads the
 * token, and registers it; it then re-registers on token refresh. Foreground
 * messages are presented as a local notification, since FCM suppresses the
 * system banner while the app is foregrounded.
 *
 * Signing out deletes the token. The backend files a token under the account
 * that registered it, so a device that kept it would go on receiving that
 * account's pushes — a movie-ready alert names the movie — even after another
 * account signs in on it (backlog E-28). The next sign-in registers a fresh
 * token, and the backend drops the deleted one the first time a send fails.
 * Signing out also clears the app's notifications from the tray: the ones
 * already there belong to the account that just left (E-29).
 */
export function usePushTokenRegistration({ recheckKey }: { recheckKey?: unknown } = {}): void {
  const isAuthenticated = useIsAuthenticated();
  const wasAuthenticated = useRef(false);
  const deletion = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (isAuthenticated) {
      wasAuthenticated.current = true;
      return;
    }
    // A launch without a session has no account's token to let go of.
    if (!wasAuthenticated.current) return;
    wasAuthenticated.current = false;
    deletion.current = deleteFcmToken().catch((error: unknown) => {
      if (__DEV__) console.warn('[push] token deletion failed:', String(error));
    });
    void dismissAllNotifications().catch((error: unknown) => {
      if (__DEV__) console.warn('[push] clearing the tray failed:', String(error));
    });
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    const unsubscribers: (() => void)[] = [];

    void (async () => {
      try {
        // A sign-in right after a sign-out must not read back the token that
        // is still being deleted.
        await deletion.current;
        if (cancelled) return;
        const granted = await hasNotificationPermission();
        if (!granted || cancelled) return;

        // Present foreground messages ourselves; without this handler+channel a
        // notification arriving while the app is open is delivered silently.
        configureForegroundNotifications();
        await ensureNotificationChannel();
        if (cancelled) return;

        await registerForRemoteMessages();
        const token = await getFcmToken();
        if (cancelled) return;
        await registerFcmToken(token);
        // A run replaced while the backend answered must not subscribe: its
        // cleanup has already run, so its listeners would never be removed and
        // every foreground push would be shown once more.
        if (cancelled) return;

        unsubscribers.push(
          onFcmTokenRefresh((refreshed) => {
            void registerFcmToken(refreshed);
          }),
        );
        unsubscribers.push(
          onForegroundMessage((message) => {
            const notification = message.notification;
            if (!notification) return;
            void presentLocalNotification({
              title: notification.title,
              body: notification.body,
              data: message.data,
            });
          }),
        );
      } catch (error) {
        if (__DEV__) console.warn('[push] token registration failed:', String(error));
      }
    })();

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [isAuthenticated, recheckKey]);
}
