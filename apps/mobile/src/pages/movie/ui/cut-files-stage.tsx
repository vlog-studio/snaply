import { StyleSheet, View } from 'react-native';

import type { SnapFiles } from '@/entities/snap';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

export type CutFilesStageProps = {
  files: SnapFiles;
};

/**
 * The stage while the cuts' videos are still being brought onto this device. A
 * snap shot on another device plays from a copy fetched on first play
 * (SNAP-15), and the cut player can only play what is here — handed a file
 * that has not arrived it would stand still without a word. This holds the
 * player's frame meanwhile, so the stage does not jump when the cuts arrive.
 */
export function CutFilesStage({ files }: CutFilesStageProps) {
  const theme = useTheme();

  return (
    <View style={[styles.box, { backgroundColor: theme.media }]}>
      <ThemedText selectable={false} style={styles.text}>
        {files.failed ? '스냅을 불러오지 못했어요' : '불러오는 중…'}
      </ThemedText>
      {files.failed ? (
        <SnaplyButton
          title="다시 시도"
          accessibilityLabel="스냅 다시 불러오기"
          onPress={files.retry}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The player's own box: height-bound, 9:16, so nothing around it moves.
  box: {
    flex: 1,
    aspectRatio: 9 / 16,
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  // Over the media backdrop, like the watch stage's own state text.
  text: { color: '#FFFFFF', textAlign: 'center' },
});
