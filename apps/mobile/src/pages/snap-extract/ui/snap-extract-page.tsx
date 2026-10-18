import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ExtractStepSec,
  MaxExtractSec,
  MinExtractSec,
  useExtractSnap,
} from '@/features/extract-snap';
import { formatDuration, formatSeconds } from '@/shared/lib/datetime';
import { impactFeedback, selectionFeedback, successFeedback } from '@/shared/lib/haptics';
import { pickVideoFromLibrary } from '@/shared/lib/video-picker';
import { DoodleIcon } from '@/shared/ui/doodle-icon';
import { AlertCard } from '@/shared/ui/notice';
import { StickerButton, StickerFace } from '@/shared/ui/sticker-button';
import { TapeLabel } from '@/shared/ui/tape-chip';
import { Shadows, Spacing, ThemeScope, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { Reel } from '@/shared/ui/reel';

import { formatPositionSec, initialWindow, windowAtTap } from '../model/extract-strip-layout';
import { useSourceDuration } from '../model/use-source-duration';
import { useWindowPlayback, WindowProgressIntervalSec } from '../model/use-window-playback';
import { ExtractStrip } from './extract-strip';

// How long the "담김" confirmation badge lingers after an extraction — the
// capture screen's own cadence.
const COLLECTED_BADGE_MS = 1100;

const SOURCE_UNREADABLE = '이 영상을 읽을 수 없어요. 다른 영상을 골라 주세요.';
const PICK_SOURCE_FAILED = '영상을 불러오지 못했어요. 다시 시도해 주세요.';

export type SnapExtractPageProps = {
  /** Local `file://` URI of the source video (the picker's cache copy). */
  sourceUri: string;
  /** The source's length when the picker already knew it. */
  knownDurationSec?: number;
};

/**
 * The ground here is video and near-black scrims, exactly like the
 * viewfinder, so the chrome is pinned to the dark palette whatever theme the
 * rest of the app resolves to.
 */
export function SnapExtractPage(props: SnapExtractPageProps) {
  return (
    <ThemeScope scheme="dark">
      <StatusBar style="light" />
      <SnapExtractScreen {...props} />
    </ThemeScope>
  );
}

/**
 * Extracting snaps out of one gallery video: the stage loops the chosen
 * window, the strip below carries the window (drag its body to move it, its
 * amber handles to resize it between half a second and five), and the scissor
 * button cuts the window into a snap — which lands in the library exactly
 * like a captured one, and the screen stays for the next cut.
 */
function SnapExtractScreen({ sourceUri, knownDurationSec }: SnapExtractPageProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { durationSec, isReading, isUnreadable } = useSourceDuration(sourceUri, knownDurationSec);
  const { extractSnap, isExtracting, error, clearError } = useExtractSnap();

  // The settled window; live drag values pass through `liveWindow` only. Set
  // during render as soon as the length is known (the page is remounted per
  // source, so this runs once per file).
  const [window, setWindow] = useState<{ startSec: number; endSec: number }>();
  if (durationSec !== undefined && window === undefined) {
    setWindow(initialWindow(durationSec));
  }
  const [liveWindow, setLiveWindow] = useState<{ startSec: number; endSec: number }>();
  const shown = liveWindow ?? window;

  const playback = useWindowPlayback(
    sourceUri,
    window ?? { startSec: 0, endSec: durationSec ?? 0 },
  );

  const [collectedCount, setCollectedCount] = useState(0);
  const [showSaved, setShowSaved] = useState(false);
  const [pickError, setPickError] = useState<string>();
  const badgeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      if (badgeTimer.current) clearTimeout(badgeTimer.current);
    },
    [],
  );

  const handleWindow = (startSec: number, endSec: number, settled: boolean) => {
    if (!settled) {
      setLiveWindow({ startSec, endSec });
      return;
    }
    setLiveWindow(undefined);
    setWindow({ startSec, endSec });
    playback.seekTo(startSec);
  };

  // A tap on the footage outside the window sends the window there, centred
  // on the tapped moment at its current length — the coarse move; the drags
  // stay the fine adjustment.
  const handleStripTap = (tapSec: number) => {
    if (window === undefined || durationSec === undefined) return;
    const next = windowAtTap(tapSec, window.endSec - window.startSec, durationSec, ExtractStepSec);
    selectionFeedback();
    setWindow(next);
    playback.seekTo(next.startSec);
  };

  const handleExtract = async () => {
    if (!window) return;
    impactFeedback('medium');
    const snap = await extractSnap(sourceUri, window.startSec, window.endSec);
    if (!snap) return;
    successFeedback();
    setCollectedCount((count) => count + 1);
    setShowSaved(true);
    if (badgeTimer.current) clearTimeout(badgeTimer.current);
    badgeTimer.current = setTimeout(() => setShowSaved(false), COLLECTED_BADGE_MS);
  };

  const changeSource = async () => {
    try {
      const picked = await pickVideoFromLibrary();
      if (!picked) return;
      setPickError(undefined);
      // The route adapter keys the page by `source`, so this lands as a fresh
      // mount on the new file.
      router.setParams({
        source: picked.uri,
        duration: picked.durationSec !== undefined ? String(picked.durationSec) : '',
      });
    } catch {
      setPickError(PICK_SOURCE_FAILED);
    }
  };

  const bannerMessage = error ?? pickError ?? (isUnreadable ? SOURCE_UNREADABLE : undefined);
  const dismissBanner = () => {
    clearError();
    setPickError(undefined);
  };

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: theme.media, paddingTop: insets.top + Spacing.three },
      ]}
    >
      <View style={styles.topBar}>
        <StickerButton
          icon="close"
          accessibilityLabel="가져오기 닫기"
          onPress={() => router.back()}
        />
        <TapeLabel fill={theme.tapeButter}>
          {collectedCount > 0 ? `스냅 ${collectedCount}개 담김` : '스냅 가져오기'}
        </TapeLabel>
        <StickerButton
          icon={playback.muted ? 'noteOff' : 'note'}
          accessibilityLabel={playback.muted ? '소리 켜기' : '소리 끄기'}
          onPress={playback.toggleMuted}
        />
      </View>

      <View style={styles.stage}>
        <VideoView
          allowsPictureInPicture={false}
          contentFit="contain"
          nativeControls={false}
          player={playback.player}
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playback.isPlaying ? '일시정지' : '재생'}
          onPress={playback.togglePlayback}
          style={styles.tapLayer}
        >
          {!playback.isPlaying ? (
            <View style={styles.playButton}>
              <StickerFace icon="play" />
            </View>
          ) : null}
        </Pressable>

        {showSaved ? (
          <View style={styles.stageBadge} pointerEvents="none">
            <TapeLabel fill={theme.tapeMint} tilt={-0.5}>
              {`담김 · 스냅 ${collectedCount}개`}
            </TapeLabel>
          </View>
        ) : null}

        {bannerMessage ? (
          <View style={styles.stageBadge}>
            <AlertCard message={bannerMessage} onDismiss={dismissBanner} style={styles.errorCard} />
          </View>
        ) : null}

        {durationSec !== undefined ? (
          <View style={styles.readout} pointerEvents="none">
            <ThemedText selectable={false} type="data" style={{ color: theme.text }}>
              {formatDuration(playback.positionSec)} / {formatDuration(durationSec)}
            </ThemedText>
          </View>
        ) : null}
      </View>

      <View style={styles.windowReadout}>
        {shown ? (
          <ThemedText selectable={false} type="data" themeColor="textSecondary">
            {formatPositionSec(shown.startSec)} – {formatPositionSec(shown.endSec)} ·{' '}
            {formatSeconds(shown.endSec - shown.startSec)}
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.stripArea}>
        {durationSec !== undefined && window !== undefined ? (
          <ExtractStrip
            sourceUri={sourceUri}
            durationSec={durationSec}
            startSec={window.startSec}
            endSec={window.endSec}
            minSec={Math.min(MinExtractSec, durationSec)}
            maxSec={MaxExtractSec}
            progressSec={playback.positionSec}
            isPlaying={playback.isPlaying}
            progressIntervalSec={WindowProgressIntervalSec}
            onWindow={handleWindow}
            onTapStrip={handleStripTap}
          />
        ) : (
          <View style={styles.stripPlaceholder}>
            {isReading ? <Reel color={theme.textSecondary} /> : null}
          </View>
        )}
      </View>

      <View style={[styles.bottomControls, { paddingBottom: insets.bottom + Spacing.five }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="다른 영상 고르기"
          disabled={isExtracting}
          onPress={() => void changeSource()}
          style={[styles.sideControl, isExtracting && styles.disabledControl]}
        >
          <StickerFace icon="gallery" />
          <ThemedText selectable={false} type="smallBold" themeColor="textSecondary">
            영상 변경
          </ThemedText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="이 구간을 스냅으로 담기"
          accessibilityState={{ disabled: isExtracting || window === undefined }}
          disabled={isExtracting || window === undefined}
          onPress={() => void handleExtract()}
          style={[
            styles.extractOuter,
            { borderColor: theme.text },
            window === undefined && styles.disabledControl,
          ]}
        >
          <View
            style={[
              styles.extractInner,
              { backgroundColor: theme.primary, boxShadow: Shadows.paper(theme.shadowInk) },
            ]}
          >
            <View pointerEvents="none" style={styles.extractStitch} />
            {isExtracting ? (
              <Reel color={theme.onPrimary} />
            ) : (
              <DoodleIcon name="scissors" size={26} color={theme.onPrimary} />
            )}
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="가져오기 마치기"
          onPress={() => router.back()}
          style={styles.sideControl}
        >
          <StickerFace icon="check" />
          <ThemedText selectable={false} type="smallBold" themeColor="textSecondary">
            완료
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    paddingHorizontal: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  stage: {
    flex: 1,
    marginTop: Spacing.three,
    marginHorizontal: Spacing.four,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  tapLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: { transform: [{ scale: 1.25 }] },
  errorCard: { alignSelf: 'stretch' },
  stageBadge: {
    position: 'absolute',
    top: Spacing.four,
    left: Spacing.four,
    right: Spacing.four,
    alignItems: 'center',
  },
  readout: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.three,
    backgroundColor: 'rgba(14,11,8,0.6)',
    paddingHorizontal: Spacing.two + Spacing.half,
    paddingVertical: Spacing.half,
  },
  windowReadout: {
    minHeight: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.three,
  },
  stripArea: {
    marginTop: Spacing.two,
  },
  stripPlaceholder: {
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomControls: {
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideControl: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  extractOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extractInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extractStitch: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: 23,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.7)',
  },
  disabledControl: { opacity: 0.42 },
});
