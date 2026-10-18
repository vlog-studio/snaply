import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Sizes } from './theme';

/** The kraft strip's own padding around the 48dp stubs (the design system's `jj-tabbar`). */
export const TabBarPadding = { top: 10, bottom: 12 } as const;

/**
 * Height of the tab bar's content area above the bottom safe-area inset —
 * padding plus one stub. The capture disc rises 18dp above it and does not
 * count: it overhangs the scene by design. Shared between the tab bar (which
 * sizes itself) and screens (which offset their scroll content) so the two
 * never drift apart.
 */
export const TabBarContentHeight = TabBarPadding.top + Sizes.touchMin + TabBarPadding.bottom;

/**
 * Total height the docked tab bar occupies, including the bottom safe-area
 * inset. The bar floats over the scene, so scrollable screens add this as
 * bottom padding to keep their last content clear of it.
 */
export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + TabBarContentHeight;
}
