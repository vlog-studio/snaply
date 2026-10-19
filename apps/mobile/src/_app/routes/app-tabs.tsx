import { Tabs, useRouter } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { impactFeedback } from '@/shared/lib/haptics';
import { DoodleIcon, type DoodleIconName } from '@/shared/ui/doodle-icon';
import { useTabBarHidden } from '@/shared/ui/tab-bar-chrome';
import {
  Shadows,
  Sizes,
  Spacing,
  TabBarPadding,
  useReducedMotion,
  useResolvedColorScheme,
  useTheme,
} from '@/shared/ui/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/**
 * Each tab's stub: its icon, and the fixed tilt it is taped at. Fixed so a tab
 * leans the same way on every launch (root docs/plans/junk-journal-redesign.md
 * §3); the press target itself never rotates.
 */
const TabStubs: Record<string, { icon: DoodleIconName; tilt: number }> = {
  index: { icon: 'studio', tilt: -1 },
  snaps: { icon: 'snaps', tilt: 1 },
  movies: { icon: 'movies', tilt: -0.5 },
  me: { icon: 'me', tilt: 1.5 },
};

export function AppTabs() {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();

  return (
    <Tabs
      tabBar={(props) => <TicketTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Tab switches cross-fade with a slight lateral shift on both
        // platforms — the JS tab navigator animates nothing by default,
        // which reads as a hard cut on Android especially.
        animation: 'shift',
        // Under reduced motion the same transition runs in zero time rather
        // than switching to `animation: 'none'`. The setting resolves after
        // the first render, and dropping the native-driven scene style then
        // leaves the scenes that were hidden at launch stuck at opacity 0 —
        // every tab but the first opened blank.
        transitionSpec: reducedMotion
          ? { animation: 'timing', config: { duration: 0 } }
          : undefined,
        // All four scenes mount at launch: a lazily-mounted scene's first
        // frame is its empty background, and the cross-fade stretches that
        // blank frame into a visible blink on the first visit to a tab.
        // Visited tabs stay mounted anyway (per-tab scroll retention), so
        // this only moves render cost to startup, behind the splash overlay.
        lazy: false,
        sceneStyle: { backgroundColor: theme.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '스튜디오' }} />
      <Tabs.Screen name="snaps" options={{ title: '스냅' }} />
      <Tabs.Screen name="movies" options={{ title: '무비' }} />
      <Tabs.Screen name="me" options={{ title: '나' }} />
    </Tabs>
  );
}

/**
 * The tab bar (the design system's `jj-tabbar`): a strip of kraft with a
 * perforated top edge, four ticket stubs, and the capture disc in the middle
 * lane, raised over the strip. The chosen tab's stub is pink and stands 4dp
 * proud. The strip is `tabbar` — kraft by day, a dark kraft at night (decision
 * 3), so no light band is left under a dark screen.
 *
 * It floats over the scene (screens pad with `useTabBarHeight`), and a screen
 * that takes the bottom of the shell over with an action bar of its own hides
 * it entirely, capture disc included — a screen that owns the bottom is not
 * offering to shoot.
 */
function TicketTabBar({ state, descriptors, navigation, insets }: TabBarProps) {
  const theme = useTheme();
  const scheme = useResolvedColorScheme();
  const tabBarHidden = useTabBarHidden();
  if (tabBarHidden) return null;

  const stubs = state.routes.map((route, index) => {
    const focused = state.index === index;
    const { options } = descriptors[route.key]!;
    const label = typeof options.title === 'string' ? options.title : route.name;
    return (
      <TabStub
        key={route.key}
        label={label}
        icon={TabStubs[route.name]?.icon ?? 'studio'}
        tilt={TabStubs[route.name]?.tilt ?? 0}
        focused={focused}
        onPress={() => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
      />
    );
  });

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.tabbar, paddingBottom: TabBarPadding.bottom + insets.bottom },
      ]}
    >
      <Perforation color={scheme === 'dark' ? 'rgba(0,0,0,0.35)' : 'rgba(43,43,43,0.18)'} />
      {stubs.slice(0, 2)}
      <View style={styles.captureLane}>
        <CaptureDisc />
      </View>
      {stubs.slice(2)}
    </View>
  );
}

/** The dashed tear line along the top of the strip. */
function Perforation({ color }: { color: string }) {
  return (
    <Svg pointerEvents="none" style={styles.perforation} width="100%" height={4}>
      <Line x1={6} x2="100%" y1={2} y2={2} stroke={color} strokeWidth={4} strokeDasharray="2 6" />
    </Svg>
  );
}

/**
 * One tab, as a ticket stub: a half-circle notch punched at the top and the
 * bottom, a dotted tear line near the bottom. The chosen stub is pink, lifted,
 * and torn along that line instead.
 */
function TabStub({
  label,
  icon,
  tilt,
  focused,
  onPress,
  onLongPress,
}: {
  label: string;
  icon: DoodleIconName;
  tilt: number;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (!size || size.width !== width || size.height !== height) setSize({ width, height });
  };
  const face = focused ? theme.pink : theme.backgroundElement;
  const ink = focused ? theme.stickerInk : theme.text;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      onLongPress={onLongPress}
      onLayout={onLayout}
      style={styles.stub}
    >
      <View
        style={[
          styles.stubFace,
          { transform: [{ translateY: focused ? -4 : 0 }, { rotate: `${tilt}deg` }] },
        ]}
      >
        {size ? (
          <Svg
            width={size.width + 1}
            height={size.height + 2}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            <Path d={stubPath(size.width, size.height, focused, 1, 2)} fill={theme.shadowInk} />
            <Path d={stubPath(size.width, size.height, focused, 0, 0)} fill={face} />
            {focused ? null : (
              <Line
                x1={6}
                x2={size.width - 6}
                y1={size.height - 8}
                y2={size.height - 8}
                stroke={theme.border}
                strokeWidth={2}
                strokeDasharray="2 3"
              />
            )}
          </Svg>
        ) : null}
        <DoodleIcon name={icon} size={26} color={ink} />
      </View>
    </Pressable>
  );
}

const StubNotch = 5;

/**
 * A stub `w`×`h` at (`dx`, `dy`): notched at the top and the bottom centre, or
 * — chosen — notched at the top and torn in a zigzag across the bottom.
 */
function stubPath(w: number, h: number, torn: boolean, dx: number, dy: number): string {
  const cx = w / 2 + dx;
  const r = StubNotch;
  const top = [`M${dx},${dy}`, `H${cx - r}`, `A${r},${r} 0 0 0 ${cx + r},${dy}`, `H${w + dx}`];
  if (torn) {
    // The tear: 78–86% of the height, alternating along the width.
    const teeth = [1, 0.92, 0.84, 0.75, 0.66, 0.58, 0.5, 0.42, 0.33, 0.25, 0.16, 0.08, 0].map(
      (x, index) => `L${x * w + dx},${(index % 2 === 0 ? 0.79 : 0.85) * h + dy}`,
    );
    return [...top, `V${0.78 * h + dy}`, ...teeth, 'Z'].join(' ');
  }
  return [
    ...top,
    `V${h + dy}`,
    `H${cx + r}`,
    `A${r},${r} 0 0 0 ${cx - r},${h + dy}`,
    `H${dx}`,
    'Z',
  ].join(' ');
}

/**
 * Capture, as a cherry disc with a stitched ring (the design system's
 * `jj-capture`), raised 18dp over the strip in the middle lane. It opens the
 * /capture modal in the root stack. Its touch area is exactly the disc.
 */
function CaptureDisc() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable
      accessibilityLabel="스냅 찍기"
      accessibilityRole="button"
      onPress={() => {
        // A full-screen modal is a large jump for one small button, so the
        // press is acknowledged in the hand as well as on screen.
        impactFeedback('light');
        router.push('/capture');
      }}
      style={({ pressed }) => [
        styles.capture,
        {
          backgroundColor: theme.primary,
          boxShadow: (pressed ? Shadows.pressed : Shadows.paper)(theme.shadowInk),
          transform: [{ translateY: -18 }, { scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <View pointerEvents="none" style={styles.captureStitch} />
      <DoodleIcon name="camera" size={26} color={theme.onPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingTop: TabBarPadding.top,
    paddingHorizontal: Spacing.two,
  },
  perforation: { position: 'absolute', top: 0, left: 0, right: 0 },
  stub: { flex: 1, minHeight: Sizes.touchMin },
  stubFace: { flex: 1, minHeight: Sizes.touchMin, alignItems: 'center', justifyContent: 'center' },
  captureLane: { width: 64, alignItems: 'center', justifyContent: 'flex-end' },
  capture: {
    width: Sizes.captureDisc,
    height: Sizes.captureDisc,
    borderRadius: Sizes.captureDisc / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureStitch: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderRadius: (Sizes.captureDisc - 10) / 2,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.7)',
  },
});
