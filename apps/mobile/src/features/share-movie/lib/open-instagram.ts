import { Linking } from 'react-native';

/** The Instagram app's own scheme — its camera/composer, where the gallery's newest item comes first. */
const InstagramAppUrl = 'instagram://camera';
/** Opens the app through its app link where installed, the website otherwise. */
const InstagramWebUrl = 'https://www.instagram.com/';

/**
 * Hand the user over to Instagram, to post a movie that was just saved to the
 * album. Not the Graph API (SNS-8) — no Meta review, no tester role, any
 * account type — so the last steps are the user's, in Instagram.
 */
export async function openInstagram(): Promise<void> {
  try {
    await Linking.openURL(InstagramAppUrl);
  } catch {
    await Linking.openURL(InstagramWebUrl);
  }
}
