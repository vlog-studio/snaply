import { CameraView } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type CaptureDuration } from '@/entities/capture-session';
import { useSnaps } from '@/entities/snap';
import { AlertCard } from '@/shared/ui/notice';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { StickerButton, StickerFace } from '@/shared/ui/sticker-button';
import { TapeChip, TapeLabel } from '@/shared/ui/tape-chip';
import { TextButton } from '@/shared/ui/text-button';
import { Shadows, Spacing, ThemeScope, useReducedMotion, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { VideoPreview } from '@/shared/ui/video-preview';

import { useCaptureRecorder } from '../model/use-capture-recorder';
import { CaptureFlight } from './capture-flight';
import { HoldRing } from './hold-ring';
import { RecordingLibrary } from './recording-library';

// How long the "담김" confirmation badge lingers after a capture.
const COLLECTED_BADGE_MS = 1100;

// The capture ring sits just outside the 88px shutter (5px stroke + gap).
const HOLD_RING_SIZE = 108;

const DURATION_OPTIONS: readonly CaptureDuration[] = [3, 5];

/**
 * The viewfinder's ground is the camera feed and near-black scrims, so its
 * chrome is pinned to the dark palette (and a light status bar) no matter
 * which theme the rest of the app resolves to.
 */
export function CaptureRecordPage() {
  return (
    <ThemeScope scheme="dark">
      <StatusBar style="light" />
      <CaptureRecordScreen />
    </ThemeScope>
  );
}

function CaptureRecordScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const {
    stage,
    showCamera,
    errorMessage,
    dismissErrors,
    closePage,
    retake,
    openLibrary,
    selectRecording,
    deleteRecording,
    deleteRecordingFromDevice,
    permissions,
    camera,
    session,
    library,
  } = useCaptureRecorder();
  // Read out once rather than through `camera.x`: the device group holds the
  // camera handle, and the compiler treats a member read on it during render as
  // reading a ref.
  const {
    attachCamera,
    facing,
    soundEnabled,
    isReady,
    isRecordingSupported,
    toggleFacing,
    toggleSound,
    handleCameraReady,
    handleMountError,
  } = camera;

  // In-camera feedback: the just-captured snap flies up into the counter; when
  // it lands, the count bumps and the counter pops. Capturing stays on the
  // viewfinder instead of bouncing back to the studio.
  const reducedMotion = useReducedMotion();
  const collectedCount = useSnaps().length;
  const collectedCountRef = useRef(collectedCount);

  useEffect(() => {
    collectedCountRef.current = collectedCount;
  }, [collectedCount]);

  // The pill count trails the store until the flying frame arrives, so the
  // number bumps as it lands rather than the instant it is persisted.
  const [displayedCount, setDisplayedCount] = useState(collectedCount);
  const [flight, setFlight] = useState<{ key: number; uri: string }>();
  const [showCollectedBadge, setShowCollectedBadge] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const processedNonce = useRef(0);
  const badgeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const counterPulse = useSharedValue(0);

  const flashCollectedBadge = () => {
    setShowCollectedBadge(true);
    if (badgeTimer.current) clearTimeout(badgeTimer.current);
    badgeTimer.current = setTimeout(() => setShowCollectedBadge(false), COLLECTED_BADGE_MS);
  };

  // The frame reached the counter: reveal the new count and pop the pill.
  const handleFlightArrive = () => {
    setFlight(undefined);
    setDisplayedCount(collectedCountRef.current);
    setPulseKey((key) => key + 1);
    flashCollectedBadge();
  };

  // Each capture starts a flight; reduced motion lands it immediately.
  useEffect(() => {
    const nonce = session.lastCollected?.nonce ?? 0;
    if (nonce === 0 || nonce === processedNonce.current) return;
    processedNonce.current = nonce;
    if (reducedMotion) {
      setDisplayedCount(collectedCountRef.current);
      flashCollectedBadge();
      return;
    }
    setFlight({ key: nonce, uri: session.lastCollected?.uri ?? '' });
  }, [session.lastCollected, reducedMotion]);

  // Pop the counter on landing (kept in an effect so the shared-value write is
  // outside any memoized callback).
  useEffect(() => {
    if (pulseKey === 0) return;
    counterPulse.value = withSequence(
      withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 440, easing: Easing.out(Easing.cubic) }),
    );
  }, [pulseKey, counterPulse]);

  useEffect(
    () => () => {
      if (badgeTimer.current) clearTimeout(badgeTimer.current);
    },
    [],
  );

  const counterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + counterPulse.value * 0.16 }],
  }));

  if (!permissions.isCameraGranted && stage !== 'review') {
    return (
      <View
        style={[
          styles.permissionScreen,
          { backgroundColor: theme.media, paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <StickerButton
          icon="close"
          accessibilityLabel="카메라 닫기"
          onPress={closePage}
          style={[styles.permissionClose, { top: insets.top + Spacing.three }]}
        />
        <View style={styles.permissionContent}>
          <View style={[styles.permissionIcon, { borderColor: theme.primary }]}>
            <View style={[styles.permissionDot, { backgroundColor: theme.primary }]} />
          </View>
          <ThemedText type="subtitle" accessibilityRole="header" style={styles.centerText}>
            카메라를 사용할 수 없어요
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            {permissions.message}
          </ThemedText>
          {permissions.isPermissionReady ? (
            <SnaplyButton
              title={permissions.canAskAgain ? '카메라·마이크 권한 허용' : '설정에서 권한 켜기'}
              onPress={
                permissions.canAskAgain
                  ? permissions.requestPermissions
                  : permissions.openAppSettings
              }
              style={styles.permissionAction}
            />
          ) : null}
          <SnaplyButton
            title={`찍어둔 스냅 보기 (${library.recordings.length})`}
            variant="secondary"
            onPress={openLibrary}
            style={styles.permissionAction}
          />
          {library.errorMessage ? (
            <ThemedText type="small" themeColor="cherryInk" style={styles.centerText}>
              {library.errorMessage}
            </ThemedText>
          ) : null}
        </View>
        <RecordingLibrary
          deletingId={library.deletingId}
          isLoading={library.isLoading}
          onClose={library.close}
          onDelete={deleteRecording}
          canDeleteFromDevice={library.canRemoveFromDevice}
          onDeleteFromDevice={deleteRecordingFromDevice}
          onSelect={selectRecording}
          recordings={library.recordings}
          visible={library.isVisible}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.media }]}>
      <View style={[styles.cameraSurface, { paddingTop: insets.top + Spacing.three }]}>
        {showCamera ? (
          <CameraView
            facing={facing}
            mirror={facing === 'front'}
            mode="video"
            mute={!soundEnabled}
            onCameraReady={handleCameraReady}
            onMountError={({ message }) => handleMountError(message || '')}
            ref={attachCamera}
            style={StyleSheet.absoluteFill}
            videoQuality="720p"
          />
        ) : null}
        {stage === 'review' && library.selected && !library.isVisible ? (
          <VideoPreview
            key={library.selected.id}
            muted={!soundEnabled}
            uri={library.selected.uri}
          />
        ) : null}

        <View style={styles.cameraShade} pointerEvents="none" />

        {flight ? (
          <CaptureFlight key={flight.key} uri={flight.uri} onArrive={handleFlightArrive} />
        ) : null}

        <View style={styles.topBar}>
          <StickerButton icon="close" accessibilityLabel="카메라 닫기" onPress={closePage} />
          <Animated.View style={counterStyle}>
            <TapeLabel fill={theme.tapeButter}>
              {`스냅${displayedCount > 0 ? ` ${displayedCount}개` : ''}`}
            </TapeLabel>
          </Animated.View>
          <StickerButton
            icon={soundEnabled ? 'note' : 'noteOff'}
            accessibilityLabel={soundEnabled ? '녹음 소리 끄기' : '녹음 소리 켜기'}
            disabled={session.isBusy}
            onPress={toggleSound}
          />
        </View>

        <View style={styles.focusArea} pointerEvents="box-none">
          {stage === 'idle' && !showCollectedBadge ? (
            <View style={styles.focusFrame} pointerEvents="none">
              <ThemedText selectable={false} type="data" themeColor="textSecondary">
                꾹 눌러 찍기
              </ThemedText>
            </View>
          ) : null}
          {stage === 'idle' && showCollectedBadge ? (
            <TapeLabel fill={theme.tapeMint} tilt={-0.5}>
              {`담김 · 스냅 ${displayedCount}개`}
            </TapeLabel>
          ) : null}
          {stage === 'recording' ? (
            <TapeLabel fill="rgba(243,231,207,0.14)" tilt={0.5}>
              <View style={[styles.recordingDot, { backgroundColor: theme.primary }]} />
              <ThemedText type="edge" style={{ color: theme.text }}>
                REC
              </ThemedText>
              {/* The countdown is Latin and reruns every second, so it stays a
                  mono stamp with tabular figures and holds its width as it
                  ticks. The Korean tail it ends on cannot be mono at all, and
                  takes `note` for that one frame. */}
              <ThemedText
                type={session.remaining > 0 ? 'edge' : 'note'}
                style={[{ color: theme.text }, styles.tabularNumber]}
              >
                {session.remaining > 0 ? `${session.remaining}초` : '마무리 중…'}
              </ThemedText>
            </TapeLabel>
          ) : null}
          {stage === 'saving' ? (
            <TapeLabel fill={theme.kraft} tilt={0.5}>
              스냅을 저장하는 중…
            </TapeLabel>
          ) : null}
          {stage === 'review' ? (
            <TapeLabel fill={theme.tapeMint} tilt={-0.5}>
              저장됨
            </TapeLabel>
          ) : null}
          {errorMessage ? (
            <AlertCard message={errorMessage} onDismiss={dismissErrors} style={styles.errorCard} />
          ) : null}
        </View>

        <View style={[styles.bottomControls, { paddingBottom: insets.bottom + Spacing.five }]}>
          {stage === 'idle' && isRecordingSupported ? (
            <View style={styles.durationToggle}>
              {DURATION_OPTIONS.map((seconds) => {
                const isSelected = session.duration === seconds;
                return (
                  <TapeChip
                    key={seconds}
                    label={`${seconds}초`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={`${seconds}초`}
                    tilt={seconds === DURATION_OPTIONS[0] ? -1.5 : 1}
                    onPress={() => session.selectDuration(seconds)}
                    style={[styles.durationChip, !isSelected && styles.durationOff]}
                  />
                );
              })}
            </View>
          ) : null}
          {stage === 'review' ? (
            <SnaplyButton title="다시 찍기" onPress={retake} />
          ) : (
            <View style={styles.captureControls}>
              <Pressable
                accessibilityLabel={`찍은 스냅 ${library.recordings.length}개 보기`}
                accessibilityRole="button"
                disabled={session.isBusy}
                onPress={openLibrary}
                style={[styles.sideControl, session.isBusy && styles.disabledControl]}
              >
                <StickerFace icon="snaps" />
                <ThemedText selectable={false} type="smallBold" themeColor="textSecondary">
                  스냅 {library.recordings.length}
                </ThemedText>
              </Pressable>
              <View style={styles.shutterArea}>
                <HoldRing
                  active={stage === 'recording'}
                  durationMs={session.duration * 1000}
                  size={HOLD_RING_SIZE}
                />
                <Pressable
                  accessibilityHint="누르는 동안 찍히고, 손을 떼면 끝나요"
                  accessibilityLabel="꾹 눌러 찍기"
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: stage === 'saving' || !isReady || !isRecordingSupported,
                  }}
                  disabled={stage === 'saving' || !isReady || !isRecordingSupported}
                  onPressIn={session.beginHold}
                  onPressOut={session.endHold}
                  style={[
                    styles.shutterOuter,
                    { borderColor: theme.text },
                    stage === 'recording' && styles.shutterRecording,
                    (!isReady || !isRecordingSupported) && styles.disabledControl,
                  ]}
                >
                  <View
                    style={[
                      styles.shutterInner,
                      { backgroundColor: theme.primary, boxShadow: Shadows.paper(theme.shadowInk) },
                      stage === 'recording' && styles.shutterInnerRecording,
                    ]}
                  >
                    {/* The stitch of the capture disc, as on the tab bar. */}
                    <View
                      style={[
                        styles.shutterStitch,
                        stage === 'recording' && styles.shutterStitchRecording,
                      ]}
                    />
                  </View>
                </Pressable>
              </View>
              <Pressable
                accessibilityLabel="카메라 전환"
                accessibilityRole="button"
                disabled={session.isBusy}
                onPress={toggleFacing}
                style={[styles.sideControl, session.isBusy && styles.disabledControl]}
              >
                <StickerFace icon="flip" />
                <ThemedText selectable={false} type="smallBold" themeColor="textSecondary">
                  전환
                </ThemedText>
              </Pressable>
            </View>
          )}
          {/* The viewfinder narrates itself: the frame says how to shoot, the
              badges say what stage it is in. The only line left is the one the
              UI cannot show — a platform that has no recorder at all. */}
          {!isRecordingSupported ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
              촬영은 iOS 또는 Android 기기에서 사용할 수 있어요
            </ThemedText>
          ) : null}
          {stage === 'review' ? (
            <TextButton
              label={`찍어둔 스냅 ${library.recordings.length}개 관리`}
              onPress={openLibrary}
              style={styles.libraryLink}
            />
          ) : null}
        </View>
      </View>

      <RecordingLibrary
        deletingId={library.deletingId}
        isLoading={library.isLoading}
        onClose={library.close}
        onDelete={deleteRecording}
        canDeleteFromDevice={library.canRemoveFromDevice}
        onDeleteFromDevice={deleteRecordingFromDevice}
        onSelect={selectRecording}
        recordings={library.recordings}
        visible={library.isVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  cameraSurface: { flex: 1, overflow: 'hidden' },
  cameraShade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  topBar: {
    paddingHorizontal: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  focusArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.five,
    paddingHorizontal: Spacing.five,
  },
  // A plain frame line: the capture screens stay dark and undecorated.
  focusFrame: {
    width: '64%',
    maxWidth: 300,
    aspectRatio: 0.8,
    borderWidth: 1.5,
    borderColor: 'rgba(243,231,207,0.38)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: Spacing.four,
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4 },
  errorCard: { alignSelf: 'stretch' },
  bottomControls: { paddingHorizontal: Spacing.five, gap: Spacing.three, alignItems: 'stretch' },
  durationToggle: { flexDirection: 'row', gap: Spacing.two, alignSelf: 'center' },
  durationChip: { minWidth: 64 },
  // An unchosen length is a strip of smoke rather than colour.
  durationOff: { backgroundColor: 'rgba(243,231,207,0.14)' },
  captureControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  shutterArea: {
    width: HOLD_RING_SIZE,
    height: HOLD_RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 68, height: 68, borderRadius: 34 },
  shutterStitch: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: 28,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.7)',
  },
  shutterRecording: { transform: [{ scale: 0.92 }] },
  // Held, the disc becomes a square: stop.
  shutterInnerRecording: { width: 32, height: 32, borderRadius: 0 },
  shutterStitchRecording: {
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: 0,
    borderWidth: 1.5,
  },
  sideControl: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  disabledControl: { opacity: 0.42 },
  libraryLink: { alignSelf: 'center' },
  centerText: { textAlign: 'center' },
  tabularNumber: { fontVariant: ['tabular-nums'] },
  permissionScreen: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.five },
  permissionClose: { position: 'absolute', left: Spacing.four },
  permissionContent: { alignItems: 'center', gap: Spacing.four },
  permissionIcon: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionDot: { width: 40, height: 40, borderRadius: 20 },
  permissionAction: { width: '100%', maxWidth: 360 },
});
