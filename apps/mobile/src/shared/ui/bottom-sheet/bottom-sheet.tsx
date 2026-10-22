import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PunchedHoles } from '@/shared/ui/paper';
import { Spacing, useReducedMotion, useTheme } from '@/shared/ui/theme';

export type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /**
   * The sheet's answers (a confirm pair, a stack of tickets), held under the
   * content rather than in it: when the content is taller than the room the
   * sheet has and scrolls, they stay in reach. A sheet whose answers are part
   * of composed content leaves this out and they scroll with the rest.
   */
  actions?: ReactNode;
  // Announced on the sheet surface for screen readers (e.g. "스냅 삭제 확인").
  accessibilityLabel?: string;
  /**
   * `note` (default) is a notebook page: a spiral and a row of punched holes
   * along the top edge. `plain` drops both — for the capture area, whose
   * sheets stay dark and plain over the viewfinder (decision 8): the canvas's
   * `cl-sheet`, a near-black slab edged by a faint cream rule, in both schemes.
   */
  variant?: 'note' | 'plain';
};

/** Spiral rings along the top edge of a note sheet. */
const SpiralRings = 12;

// The capture area's sheet (the canvas's `cl-sheet`): a shade above the `media`
// ground, so it reads as a sheet over the list without turning into paper.
// Literal, like the other tints over media — the same in both schemes.
const PlainSheetGround = '#1C1712';
const PlainSheetEdge = 'rgba(243, 231, 207, 0.16)';

// The side margin inside each sheet: a note page's, and the canvas `cl-sheet`'s.
const SideMargin = { note: Spacing.five, plain: Spacing.four } as const;

// Kept clear above a sheet too tall for the screen, under the status bar's
// inset: room for the spiral standing above a note sheet's edge, and a strip
// of the screen behind so it still reads as a sheet.
const TopClearance = Spacing.five;

// How far the scroll view's box reaches above and below its content, so a
// ticket's offset shadow or a leaning scrap at either end is not clipped by it.
const ScrollBleed = Spacing.one;

// Motion values. The panel leads and the backdrop trails it, which is the whole
// point of driving them separately: the Modal's own `animationType="slide"`
// animates the entire window, so the dimming layer visibly slid up with the
// panel as one block.
const PanelOpenDuration = 320;
const PanelCloseDuration = 220;
const BackdropFadeInDuration = 200;
const BackdropFadeOutDuration = 260;

// The shared-value writes live in module-level drivers rather than in callbacks
// defined in the component body: the React Compiler lint
// (`react-hooks/immutability`) rejects `.value` writes it sees there, and the
// accepted fix is to pass the shared values into a plain function.
function driveBackdropIn(backdropOpacity: SharedValue<number>, reducedMotion: boolean) {
  backdropOpacity.value = reducedMotion
    ? 1
    : withTiming(1, { duration: BackdropFadeInDuration, easing: Easing.out(Easing.quad) });
}

function drivePanelIn(panelProgress: SharedValue<number>, reducedMotion: boolean) {
  panelProgress.value = reducedMotion
    ? 1
    : withTiming(1, { duration: PanelOpenDuration, easing: Easing.out(Easing.cubic) });
}

function measurePanel(panelHeight: SharedValue<number>, height: number) {
  panelHeight.value = height;
}

// Reduced motion: no fade, no slide — the sheet is simply gone on the same tick.
function driveCloseImmediately(
  backdropOpacity: SharedValue<number>,
  panelProgress: SharedValue<number>,
  panelHeight: SharedValue<number>,
) {
  backdropOpacity.value = 0;
  panelProgress.value = 0;
  panelHeight.value = 0;
}

function driveClose(
  backdropOpacity: SharedValue<number>,
  panelProgress: SharedValue<number>,
  panelHeight: SharedValue<number>,
  onClosed: () => void,
) {
  backdropOpacity.value = withTiming(0, {
    duration: BackdropFadeOutDuration,
    easing: Easing.in(Easing.quad),
  });
  panelProgress.value = withTiming(
    0,
    { duration: PanelCloseDuration, easing: Easing.in(Easing.cubic) },
    (finished) => {
      // Interrupted by a re-open: keep the measurement and leave the mount alone.
      if (!finished) return;
      panelHeight.value = 0;
      scheduleOnRN(onClosed);
    },
  );
}

// A lightweight bottom sheet built on the platform Modal. The panel is anchored
// to the bottom and slides up while the backdrop only fades — two independent
// shared values over a Modal with no animation of its own. Tapping the backdrop
// dismisses it. Kept business-agnostic — callers pass their own content.
//
// The panel's travel distance is its own measured height, so the closed offset
// is not known until the first layout pass: the panel stays transparent until
// then, and the slide starts from `onLayout`. The measurement is dropped once
// the close animation finishes so the next open re-measures whatever content
// the caller passes that time.
//
// Mount outlives `visible`: the Modal stays up through the close animation and
// unmounts from the panel animation's completion callback.
//
// The sheet lifts itself clear of the keyboard, which a sheet holding a text
// field needs and one without never notices. `padding` is the behavior on both
// platforms: a transparent, status-bar-translucent Modal window does not get
// resized by Android's adjustResize, so the keyboard would otherwise sit on top
// of whatever is at the bottom of the sheet — in practice its primary action.
// While the keyboard is up the panel also drops its safe-area bottom padding,
// since the gesture bar it reserves room for is behind the keyboard.
//
// A sheet taller than the room it has — legal facts at a large system font, a
// caption with the keyboard up — never lifts its top past the screen: the
// panel stops `TopClearance` under the status bar and shrinks, and the content
// scrolls inside it while the binding and any `actions` stay put. A sheet that
// fits draws as it would without the scroll view, which only scrolls once there
// is more than fits.
export function BottomSheet({
  visible,
  onClose,
  children,
  actions,
  accessibilityLabel,
  variant = 'note',
}: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [mounted, setMounted] = useState(visible);
  const backdropOpacity = useSharedValue(0);
  const panelProgress = useSharedValue(0);
  const panelHeight = useSharedValue(0);
  // The open slide waits for the first layout; this keeps a later layout pass
  // (content changing while the sheet is open) from replaying it.
  const openStartedRef = useRef(false);

  // Mount changes that are not waiting on an animation are render-phase
  // adjustments, not effects: opening has to have the Modal up in the same
  // commit that starts the fade, and a reduced-motion close has nothing to wait
  // for. The animated close is the one that unmounts later, from `driveClose`'s
  // completion callback.
  if (visible && !mounted) setMounted(true);
  if (!visible && mounted && reducedMotion) setMounted(false);

  useEffect(() => {
    if (visible) {
      driveBackdropIn(backdropOpacity, reducedMotion);
      // A re-open after a completed close re-measures from `onLayout`; a re-open
      // that interrupted a close still has its height and starts here.
      if (panelHeight.value > 0 && !openStartedRef.current) {
        openStartedRef.current = true;
        drivePanelIn(panelProgress, reducedMotion);
      }
      return;
    }

    openStartedRef.current = false;
    if (reducedMotion) {
      driveCloseImmediately(backdropOpacity, panelProgress, panelHeight);
      return;
    }
    driveClose(backdropOpacity, panelProgress, panelHeight, () => setMounted(false));
  }, [backdropOpacity, panelHeight, panelProgress, reducedMotion, visible]);

  const handlePanelLayout = (event: LayoutChangeEvent) => {
    // A layout pass that lands while the sheet is closing (the keyboard
    // dismissing shifts the bottom padding) must neither retarget the running
    // slide nor start a new one.
    if (!visible) return;
    const { height } = event.nativeEvent.layout;
    if (height <= 0) return;
    measurePanel(panelHeight, height);
    if (openStartedRef.current) return;
    openStartedRef.current = true;
    drivePanelIn(panelProgress, reducedMotion);
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: panelHeight.value === 0 ? 0 : 1,
    transform: [{ translateY: (1 - panelProgress.value) * panelHeight.value }],
  }));

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return (
    <Modal
      transparent
      statusBarTranslucent
      animationType="none"
      visible={mounted}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            accessibilityLabel="닫기"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.backdropPress}
          />
        </Animated.View>
        <Animated.View
          accessibilityLabel={accessibilityLabel}
          onLayout={handlePanelLayout}
          style={[
            styles.sheet,
            panelStyle,
            variant === 'note'
              ? {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                  boxShadow: `0 -2px 0 ${theme.shadowInk}`,
                  paddingTop: 34,
                }
              : // No paper, so no paper shadow either.
                { backgroundColor: PlainSheetGround, borderColor: PlainSheetEdge, paddingTop: 22 },
            {
              paddingHorizontal: SideMargin[variant],
              marginTop: insets.top + TopClearance,
              paddingBottom: keyboardVisible ? Spacing.four : insets.bottom + Spacing.six,
            },
          ]}
        >
          {variant === 'note' ? (
            <>
              <PunchedHoles count={SpiralRings} />
              <View pointerEvents="none" style={styles.spiral}>
                {Array.from({ length: SpiralRings }, (_, index) => (
                  <View key={index} style={[styles.ring, { borderColor: theme.textSecondary }]} />
                ))}
              </View>
            </>
          ) : null}
          <ScrollView
            alwaysBounceVertical={false}
            keyboardShouldPersistTaps="handled"
            style={[styles.scroll, { marginHorizontal: -SideMargin[variant] }]}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingHorizontal: SideMargin[variant] },
            ]}
          >
            {children}
          </ScrollView>
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Darkened paper, not black (the design system's `jj-scrim`).
    backgroundColor: 'rgba(43, 35, 28, 0.5)',
  },
  backdropPress: { flex: 1 },
  // A notebook page torn off the pad: square, a top edge, and the paper's own
  // short shadow cast upward. It gives up height (under its `marginTop`, and
  // above the keyboard's padding) rather than running off the top; the scroll
  // view absorbs it.
  sheet: {
    flexShrink: 1,
    borderTopWidth: 1,
    gap: Spacing.three,
  },
  // The box reaches out to the panel's side edges and `ScrollBleed` past the
  // content's top and bottom, and the content is padded back in by as much, so
  // it sits where it would without a scroll view while a shadow or a lean at
  // its edge is not clipped. It takes its content's height and gives some back
  // only when the panel has to shrink.
  scroll: { flexGrow: 0, marginVertical: -ScrollBleed },
  scrollContent: { paddingVertical: ScrollBleed, gap: Spacing.three },
  actions: { gap: Spacing.three },
  spiral: {
    position: 'absolute',
    top: -10,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ring: { width: 10, height: 26, borderRadius: 6, borderWidth: 2.5 },
});
