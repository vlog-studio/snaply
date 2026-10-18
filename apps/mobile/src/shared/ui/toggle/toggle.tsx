import { Pressable, StyleSheet, View } from 'react-native';

import { OpacityDisabled, Shadows, Sizes, useTheme } from '@/shared/ui/theme';

export type ToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
};

const Disc = 24;

/**
 * An on/off switch drawn as a snap fastener (the design system's `jj-snap`):
 * off, its two halves sit apart and open; on, they close onto each other in
 * pink with dark ink. Replaces the platform `Switch` so a setting row reads as
 * the same paper world as the rest. A switch to the screen reader, 48dp tall.
 */
export function Toggle({ value, onValueChange, accessibilityLabel, disabled }: ToggleProps) {
  const theme = useTheme();
  const disc = value
    ? { backgroundColor: theme.pink, borderColor: theme.stickerInk }
    : { backgroundColor: theme.backgroundElement, borderColor: theme.fieldLine };
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: disabled === true }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [
        styles.target,
        { opacity: disabled ? OpacityDisabled : pressed ? 0.8 : 1 },
      ]}
    >
      <View style={styles.art}>
        <View style={[styles.disc, disc, { left: value ? Disc / 2 : 0 }]} />
        <View
          style={[
            styles.disc,
            disc,
            { left: value ? Disc / 2 : Disc },
            value && { boxShadow: Shadows.paper(theme.shadowInk) },
          ]}
        >
          <View
            style={[
              styles.stud,
              value ? styles.studClosed : null,
              { backgroundColor: value ? theme.stickerInk : theme.fieldLine },
            ]}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    minHeight: Sizes.touchMin,
    minWidth: 64,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  art: { width: Disc * 2, height: Disc + 4 },
  disc: {
    position: 'absolute',
    top: 2,
    width: Disc,
    height: Disc,
    borderRadius: Disc / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stud: { width: 8, height: 8, borderRadius: 4 },
  studClosed: { width: 6, height: 6, borderRadius: 3 },
});
