import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DoodleIconName } from '@/shared/ui/doodle-icon';
import { PaperPiece, Tape } from '@/shared/ui/paper';
import { StickerButton } from '@/shared/ui/sticker-button';
import { MaxContentWidth, Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

/**
 * The stickers sit on the content column's edge less a little, so the disc's
 * shadow and the column line up by eye rather than by box.
 */
const EdgeInset = Spacing.four;

/** The one action a titled bar may carry, on the trailing edge. */
type BackBarAction = {
  icon: DoodleIconName;
  /** Names the action for screen readers — the glyph alone does not. */
  label: string;
  onPress: () => void;
};

export type BackBarProps = {
  onPress: () => void;
  /** Overridden when "back" needs naming for a specific screen. */
  accessibilityLabel?: string;
  /**
   * The thing the screen is about, for a screen that cannot spend a row on
   * naming it below the bar.
   */
  title?: string;
  /** An action on that thing; only meaningful beside a `title`. */
  action?: BackBarAction;
  /**
   * The title is something the user named (a movie), so it is written on a
   * torn label taped to the page rather than printed as a bar title — the
   * design system keeps tape labels for user-named things.
   */
  titleLabel?: boolean;
};

/**
 * The way out of a pushed screen — and, where the screen has no room to name
 * itself, the line that names it.
 *
 * It replaced a titled navigation bar, which over these screens said the same
 * thing twice: the bar named the *kind* of screen (`템플릿`, `무비`) while the
 * screen's own first line named the thing itself (`동네 산책`). The generic one
 * is the one worth losing — every tab screen already opens on a large title
 * with no bar above it, so dropping the chrome is what makes a pushed screen
 * look like the rest of the app rather than an exception to it.
 *
 * A scrolling screen keeps that shape: bare bar, title in the content. A
 * screen whose zones are all fixed (`/movie/[id]`, where the stage lives on
 * whatever height the rest leaves over) hands its title to the bar instead,
 * because the row under the arrow is 48dp of tap target with a 24dp line's
 * worth of empty space in it — the title rides along for free, and the row it
 * used to occupy goes to the stage.
 *
 * Either way the bar stays pinned rather than scrolling away with the content:
 * it is the only visible way back on iOS, where there is no system back button.
 */
export function BackBar({
  onPress,
  accessibilityLabel = '뒤로 가기',
  title,
  action,
  titleLabel = false,
}: BackBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + Spacing.one }]}>
      <StickerButton icon="back" accessibilityLabel={accessibilityLabel} onPress={onPress} />

      {title && titleLabel ? (
        <View style={styles.title}>
          <Tape color="tapeButter" width={44} height={14} style={styles.labelTape} />
          <PaperPiece edge="tornBottom" tilt={-1} style={styles.label}>
            <ThemedText
              accessibilityRole="header"
              selectable={false}
              numberOfLines={1}
              type="barTitle"
            >
              {title}
            </ThemedText>
          </PaperPiece>
        </View>
      ) : title ? (
        <ThemedText
          accessibilityRole="header"
          selectable={false}
          numberOfLines={1}
          type="barTitle"
          style={styles.title}
        >
          {title}
        </ThemedText>
      ) : null}

      {action ? (
        <StickerButton
          icon={action.icon}
          accessibilityLabel={action.label}
          onPress={action.onPress}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: EdgeInset,
    paddingBottom: Spacing.one,
  },
  // Takes the room between the two stickers.
  title: { flex: 1 },
  labelTape: { position: 'absolute', top: -6, alignSelf: 'center', zIndex: 2 },
  label: {
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.three + Spacing.half,
    paddingBottom: Spacing.two + Spacing.half,
  },
});
