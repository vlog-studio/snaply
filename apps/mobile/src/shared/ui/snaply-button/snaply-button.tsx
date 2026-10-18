import { useState } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
} from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { Sizes, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

type SnaplyButtonVariant = 'primary' | 'secondary' | 'ai' | 'danger' | 'ghost';

export type SnaplyButtonProps = Omit<PressableProps, 'children'> & {
  title: string;
  icon?: string;
  variant?: SnaplyButtonVariant;
};

/** The admission ticket's notch at each short end, and where its perforation runs. */
const NotchRadius = 7;
const PerforationInset = 14;

/**
 * The app's button — an admission ticket (the design system's `jj-ticket`):
 * a notched face with a perforation at each end, a short hard shadow, and a
 * bold label. `primary` is cherry with white; `secondary` is sheet with navy;
 * `ai` is lavender with dark ink; `danger` is kraft with dark ink and a `VOID`
 * stamp — a delete is not red, because red is the main action. `ghost` is not
 * a ticket at all but a text button: ink with a pink highlighter.
 *
 * Disabled is faded paper rather than half opacity (decision 9): a cherry
 * ticket at half opacity reads as a different, pink button. Pressing sinks the
 * face 1dp onto a shorter shadow. The press target is the unrotated box and at
 * least 48dp (`Sizes.touchMin`).
 */
export function SnaplyButton({
  disabled,
  icon,
  style,
  title,
  variant = 'primary',
  ...props
}: SnaplyButtonProps) {
  const theme = useTheme();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  if (variant === 'ghost') {
    return (
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        style={(state) => [
          styles.textButton,
          { opacity: disabled ? 0.5 : state.pressed ? 0.7 : 1 },
          typeof style === 'function' ? style(state) : style,
        ]}
        {...props}
      >
        <ThemedText
          selectable={false}
          type="link"
          style={[styles.highlight, { backgroundColor: theme.pink, color: theme.stickerInk }]}
        >
          {icon ? `${icon} ` : ''}
          {title}
        </ThemedText>
      </Pressable>
    );
  }

  const faces = {
    primary: { face: theme.primary, label: theme.onPrimary, perf: 'rgba(255,255,255,0.55)' },
    secondary: { face: theme.backgroundElement, label: theme.navy, perf: theme.border },
    ai: { face: theme.aiFill, label: theme.stickerInk, perf: 'rgba(43,43,43,0.25)' },
    danger: { face: theme.kraft, label: theme.stickerInk, perf: 'rgba(43,43,43,0.25)' },
  } as const;
  const { face, label, perf } = disabled
    ? { face: theme.border, label: theme.textSecondary, perf: 'rgba(43,43,43,0.18)' }
    : faces[variant];

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (!size || size.width !== width || size.height !== height) setSize({ width, height });
  };

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onLayout={onLayout}
      style={(state) => [styles.ticket, typeof style === 'function' ? style(state) : style]}
      {...props}
    >
      {({ pressed }) => (
        <>
          {size ? (
            <Svg
              width={size.width}
              height={size.height + 2}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            >
              {/* The shadow is the same ticket, offset — a box shadow would fill the notches. */}
              <Path
                d={ticketPath(size.width, size.height, pressed ? 0 : 1, pressed ? 1 : 2)}
                fill={theme.shadowInk}
              />
              <Path d={ticketPath(size.width, size.height, 0, pressed ? 1 : 0)} fill={face} />
              {[PerforationInset, size.width - PerforationInset].map((x) => (
                <Line
                  key={x}
                  x1={x}
                  x2={x}
                  y1={8 + (pressed ? 1 : 0)}
                  y2={size.height - 8 + (pressed ? 1 : 0)}
                  stroke={perf}
                  strokeWidth={2}
                  strokeDasharray="2 3"
                />
              ))}
            </Svg>
          ) : null}
          <View
            style={[
              styles.labelRow,
              pressed && styles.sunk,
              variant === 'danger' && styles.dangerLabel,
            ]}
          >
            {icon ? (
              <ThemedText selectable={false} style={[styles.icon, { color: label }]}>
                {icon}
              </ThemedText>
            ) : null}
            <ThemedText selectable={false} type="button" style={{ color: label }}>
              {title}
            </ThemedText>
          </View>
          {variant === 'danger' ? (
            <View
              pointerEvents="none"
              style={[styles.void, { borderColor: theme.stickerInk }, pressed && styles.sunk]}
            >
              <ThemedText selectable={false} type="edge" style={{ color: theme.stickerInk }}>
                VOID
              </ThemedText>
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

/** A rectangle `w`×`h` at (`dx`, `dy`) with a half-circle notch cut into each short end. */
function ticketPath(w: number, h: number, dx: number, dy: number): string {
  const cy = h / 2 + dy;
  const r = Math.min(NotchRadius, h / 2);
  return [
    `M${dx},${dy}`,
    `H${w + dx}`,
    `V${cy - r}`,
    `A${r},${r} 0 0 0 ${w + dx},${cy + r}`,
    `V${h + dy}`,
    `H${dx}`,
    `V${cy + r}`,
    `A${r},${r} 0 0 0 ${dx},${cy - r}`,
    'Z',
  ].join(' ');
}

const styles = StyleSheet.create({
  ticket: {
    minHeight: Sizes.ticketHeight,
    minWidth: Sizes.touchMin,
    justifyContent: 'center',
  },
  labelRow: {
    minHeight: Sizes.ticketHeight,
    paddingHorizontal: Spacing.six - Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  // Room for the stamp at the right end, so the label stays centred in what is left.
  dangerLabel: { paddingRight: 72 },
  sunk: { transform: [{ translateY: 1 }] },
  void: {
    position: 'absolute',
    right: 26,
    top: '50%',
    marginTop: -10,
    borderWidth: 2,
    paddingHorizontal: Spacing.one,
    opacity: 0.35,
    transform: [{ rotate: '-12deg' }],
  },
  icon: { fontSize: 17, lineHeight: 22 },
  textButton: {
    minHeight: Sizes.touchMin,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The pink highlighter under a text button's words. RN text has no gradient
  // ground, so the stroke is the text's own background — a flat band, which is
  // what the highlighter reads as at this size.
  highlight: { paddingHorizontal: 2 },
});
