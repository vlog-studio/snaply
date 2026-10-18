import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Fonts, OpacityDisabled, Sizes, Spacing, Typography, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type TextFieldProps = TextInputProps & {
  /** Field label rendered above the input. */
  label?: string;
  /** Error message rendered below the input; also recolors the border. */
  error?: string;
};

/**
 * Themed single-line text input — a line on a memo pad (the design system's
 * `jj-field`): no box, one underline that is the control (`fieldLine`, 5.41 on
 * paper), cherry-ink when it holds an error, and a cherry-ink caret. The shared
 * base every form (auth email/password/OTP, and future forms) builds on. It
 * owns presentation only — the underline colour and the label/error slots —
 * and forwards all native `TextInput` props (secure entry, keyboard type,
 * autocomplete, etc.) so callers control behavior.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, style, onBlur, onFocus, editable = true, accessibilityLabel, ...props },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  // Focus thickens the line rather than recolouring it — red is an error here.
  const borderColor = error ? theme.cherryInk : focused ? theme.text : theme.fieldLine;

  return (
    <View style={styles.container}>
      {label ? <ThemedText type="smallBold">{label}</ThemedText> : null}
      <TextInput
        ref={ref}
        editable={editable}
        accessibilityLabel={accessibilityLabel ?? label}
        placeholderTextColor={theme.textSecondary}
        selectionColor={theme.cherryInk}
        cursorColor={theme.cherryInk}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          {
            borderBottomColor: borderColor,
            borderBottomWidth: focused || error ? 3 : 2,
            color: theme.text,
            opacity: editable ? 1 : OpacityDisabled,
          },
          style,
        ]}
        {...props}
      />
      {error ? (
        <ThemedText type="small" themeColor="cherryInk">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: Spacing.one },
  input: {
    minHeight: Sizes.touchMin,
    paddingHorizontal: Spacing.half,
    paddingTop: Spacing.three - Spacing.half,
    paddingBottom: Spacing.two - Spacing.half,
    // Body family, size, and weight, matching `ThemedText`'s default so a field
    // reads as the same text as the screen around it — a `TextInput` is outside
    // `ThemedText`, so it names the family itself. Only the size is taken from
    // the scale: `lineHeight` on a `TextInput` shifts the text off the input's
    // own vertical centering on Android, and `minHeight` already sets the height.
    fontFamily: Fonts.sans,
    fontSize: Typography.body.fontSize,
    fontWeight: '400',
  },
});
