import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { movieRecipeLabel, movieStyleLabel, type Movie } from '@/entities/movie';
import { useSnapFiles, type Snap } from '@/entities/snap';
import type { RenderSource } from '@/features/compose-movie';
import { shareBlockMessage, type MovieSharing } from '@/features/share-movie';
import { formatDateTime, formatSeconds } from '@/shared/lib/datetime';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { DoodleIcon } from '@/shared/ui/doodle-icon';
import { NoticeBand } from '@/shared/ui/notice';
import { PaperPiece, Tape } from '@/shared/ui/paper';
import { MaxContentWidth, Shadows, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { emptyStageReason } from '../model/cut-gone';
import { resultExpiry } from '../model/result-expiry';
import { toPlaybackCuts } from '../model/playback-cuts';
import type { Cut } from '../model/use-movie-cuts';
import { watchDurationSec } from '../model/watch-cuts';
import { CutFilesStage } from './cut-files-stage';
import { CutPlayer } from './cut-player';
import { RenderPlayer } from './render-player';

export type MovieWatchProps = {
  movie: Movie;
  /** The finished composition's cuts — the render snapshot when one exists. */
  cuts: Cut[];
  /**
   * The rendered file, resolved to a fresh address — the page resolves it once
   * and 공유 uses the same source, so the stage and the share can never
   * disagree about which file the render is.
   */
  renderSource: RenderSource;
  sharing: MovieSharing;
  /**
   * True when the stored cut list drifted from this render's composition —
   * the stage is playing the finished movie, not the edits.
   */
  editedSinceRender: boolean;
  /** Opens the studio on the edited composition. */
  onReviewEdits: () => void;
  /** Opens the 끝내기 confirm (MOV-17); never finishes by itself. */
  onFinish: () => void;
  /**
   * Opens the Instagram post sheet (SNS-8). Absent when the render has no file
   * on the server to post — the same condition that blocks 공유.
   */
  onPostToInstagram?: () => void;
};

/**
 * A finished movie as something to watch, not something to fix — what fills
 * the screen below the back bar while a `ready` movie is in watch mode.
 *
 * The stage takes everything the two rows below leave over, exactly as the
 * studio's stage does, but nothing around it is a control surface: no
 * timeline, no transport, no chips, no inspector. Playing is the stage's own
 * tap. What the studio's chips and 세부 sheet carry as editable settings, the
 * one line under the stage states as facts — when it was finished, how long it
 * runs, and the style it was made with. Each is read off the *render*, not off
 * the movie's live settings: a finished movie's style can be changed in the
 * studio without being made again, and this line describes the file on the
 * stage (2026-08-13). No track is among them: the pipeline scores a run from
 * the style preset, so a movie's stored `bgm` was never a fact about the file
 * being played.
 *
 * 공유 and, while the render has a file on the server, Instagram에 게시 are the
 * mode's standing actions (editing, renaming, and deleting live in the ⋯
 * sheet). 공유 is visible but disabled until a render produces a real file,
 * the same idiom as the studio footer — with the reason written under it,
 * because a lone disabled primary action explains nothing by itself.
 *
 * The stage plays the finished movie, in whichever form the run left it:
 * the rendered file as one video when the render has one (`render.uri`), and
 * the render's own cut composition back to back when it does not (mock mode,
 * renders from before the backend composited anything). Fixing the movie is
 * the studio's job either way — its stage keeps playing the *editable* cuts,
 * which is what a change is judged against before paying for a run.
 *
 * A drifted cut list says so here too: the stage plays what was made, so
 * edits kept for later (`editedSinceRender`) are invisible on this face —
 * without the notice, the only place that admits they exist is the studio
 * the user just chose to leave.
 */
export function MovieWatch({
  movie,
  cuts,
  renderSource,
  sharing,
  editedSinceRender,
  onReviewEdits,
  onFinish,
  onPostToInstagram,
}: MovieWatchProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const playbackCuts = toPlaybackCuts(cuts);
  const totalSec = watchDurationSec(movie, cuts);
  // The cuts play only when there is no render to play; only then must their
  // videos be here, and only then is a snap from another device fetched.
  const playsCuts =
    !renderSource.resolving && renderSource.uri === undefined && !renderSource.unresolved;
  const cutSnaps = useMemo(
    () => (playsCuts ? cuts.flatMap((cut): Snap[] => (cut.snap ? [cut.snap] : [])) : []),
    [playsCuts, cuts],
  );
  const cutFiles = useSnapFiles(cutSnaps);
  // Facts about the *finished* movie, so each one comes off the render rather
  // than off the movie's live settings, which keep moving after a run: the style
  // is the preset the file was actually graded and cut with, and a render that
  // never stored one says nothing instead of naming the current pick (2026-08-13).
  // No track among them either — the pipeline scores from the preset, so the
  // stored `bgm` never described what this file plays.
  const renderedStyle = movie.render?.style;
  // The recipe the same way; `classic` is the movie as it always was, so only
  // the trend recipes are worth naming.
  const renderedRecipe = movie.render?.recipe;
  const facts = [
    movie.render ? `${formatDateTime(movie.render.renderedAt)} 완성` : undefined,
    formatSeconds(totalSec),
    renderedStyle ? movieStyleLabel(renderedStyle) : undefined,
    renderedRecipe && renderedRecipe !== 'classic' ? movieRecipeLabel(renderedRecipe) : undefined,
  ].filter((fact) => fact !== undefined);
  // When the unfinished file goes away (MOV-16). Read once per visit: the line
  // is a deadline in days, and a screen left open across midnight is rare.
  const [now] = useState(Date.now);
  const expiry = movie.render ? resultExpiry(movie.render.renderedAt, now) : undefined;
  const blockReason = shareBlockMessage(sharing.blocked);
  const printStyle = {
    backgroundColor: theme.backgroundElement,
    borderColor: theme.border,
    boxShadow: Shadows.paper(theme.shadowInk),
  };

  return (
    <View style={styles.body}>
      <View style={styles.stage}>
        {renderSource.resolving ? (
          // A fresh address is on its way; opening the cut player meanwhile
          // would flash the raw material before the finished movie.
          <View style={[styles.playerBox, styles.resolving, { backgroundColor: theme.media }]}>
            <ThemedText selectable={false} style={styles.resolvingText}>
              불러오는 중…
            </ThemedText>
          </View>
        ) : renderSource.uri !== undefined ? (
          <View style={[styles.playerBox, styles.print, printStyle]}>
            <Tape color="tapeMint" width={40} height={14} tilt={-35} style={styles.tapeLeft} />
            <Tape color="tapePink" width={40} height={14} tilt={35} style={styles.tapeRight} />
            <RenderPlayer
              uri={renderSource.uri}
              coverUri={movie.render?.thumbnailUri}
              fallbackFrameUri={playbackCuts[0]?.uri}
              style={styles.player}
            />
          </View>
        ) : renderSource.unresolved ? (
          // The movie has a file and this device could not reach its address.
          // Falling through to the cuts below would put the raw material on the
          // stage in the finished movie's place — the substitution 공유 refuses
          // to make — and it would look like the run had produced nothing.
          <PaperPiece edge="tornBottom" tilt={-1} style={styles.empty}>
            <ThemedText type="heading" style={styles.centerText}>
              완성된 무비를 불러오지 못했어요
            </ThemedText>
            <ThemedText type="bodySm" themeColor="textSecondary" style={styles.centerText}>
              연결을 확인하고 다시 시도해 주세요.
            </ThemedText>
            <SnaplyButton
              title="다시 시도"
              accessibilityLabel="완성된 무비 다시 불러오기"
              onPress={renderSource.retry}
            />
          </PaperPiece>
        ) : playbackCuts.length > 0 && (cutFiles.fetching || cutFiles.failed) ? (
          <CutFilesStage files={cutFiles} />
        ) : playbackCuts.length > 0 ? (
          <View style={[styles.playerBox, styles.print, printStyle]}>
            <Tape color="tapeMint" width={40} height={14} tilt={-35} style={styles.tapeLeft} />
            <Tape color="tapePink" width={40} height={14} tilt={35} style={styles.tapeRight} />
            <CutPlayer cuts={playbackCuts} style={styles.player} />
          </View>
        ) : (
          <PaperPiece edge="tornBottom" tilt={-1} style={styles.empty}>
            <ThemedText type="heading">재생할 컷이 없어요</ThemedText>
            <ThemedText type="bodySm" themeColor="textSecondary" style={styles.centerText}>
              {emptyStageReason(cuts) === 'expired'
                ? '이 무비가 쓰던 스냅의 보관 기간이 끝났어요.'
                : '이 무비가 쓰던 스냅이 모두 삭제됐어요.'}
            </ThemedText>
          </PaperPiece>
        )}
      </View>

      <ThemedText type="data" style={styles.facts}>
        {facts.join(' · ')}
      </ThemedText>
      {expiry ? (
        <ThemedText
          type={expiry.urgent ? 'smallBold' : 'small'}
          themeColor={expiry.urgent ? 'cherryInk' : 'textSecondary'}
          style={styles.facts}
        >
          {expiry.text}
        </ThemedText>
      ) : null}

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        {editedSinceRender ? (
          <NoticeBand
            message="편집한 컷 구성이 있어요. 다시 만들기 전까지 무비는 완성 당시 구성으로 재생돼요."
            action={{
              label: '구성 확인하고 다시 만들기',
              accessibilityLabel: '편집한 구성 확인하고 다시 만들기',
              onPress: onReviewEdits,
            }}
          />
        ) : null}
        <SnaplyButton
          // The file downloads to the cache before the sheet can open, so the
          // button says what the wait is instead of looking ignored.
          title={sharing.busy ? '공유 준비 중…' : '공유'}
          leading={<DoodleIcon name="share" size={20} color={theme.onPrimary} />}
          disabled={sharing.blocked !== undefined || sharing.busy}
          onPress={sharing.share}
        />
        {onPostToInstagram ? (
          <SnaplyButton title="Instagram에 게시" variant="secondary" onPress={onPostToInstagram} />
        ) : null}
        {/* Off with its reason under it — and off without a word while the
            file's address is still on its way, when there is no reason yet. */}
        {sharing.blocked !== undefined ? (
          blockReason !== undefined ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
              {blockReason}
            </ThemedText>
          ) : null
        ) : sharing.failed ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
            완성된 무비를 내려받지 못했어요. 연결을 확인하고 다시 시도해 주세요.
          </ThemedText>
        ) : sharing.offered ? (
          // The share sheet has been up, which is the one moment 끝내기 is
          // worth offering — and offering is all this does. The sheet never
          // says whether the file was saved (MOV-18), so nothing here decides
          // for the user; the confirm asks them.
          <NoticeBand
            message="기기에 저장했다면 무비를 정리할 수 있어요."
            action={{ label: '정리하기', accessibilityLabel: '무비 정리하기', onPress: onFinish }}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  stage: {
    flex: 1,
    minHeight: 160,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.two,
  },
  // Height-bound like the studio stage: the leftover height and the 9:16 ratio
  // decide the width, so the rows below never leave the screen.
  playerBox: { flex: 1, aspectRatio: 9 / 16, maxWidth: '100%' },
  // The finished movie as an instant print taped at two corners.
  print: { padding: 6, borderWidth: 1 },
  tapeLeft: { position: 'absolute', top: -4, left: -12, zIndex: 2 },
  tapeRight: { position: 'absolute', top: -4, right: -12, zIndex: 2 },
  resolving: { alignItems: 'center', justifyContent: 'center' },
  // Over the stage's media backdrop, same as RenderPlayer's own state text.
  resolvingText: { color: '#FFFFFF' },
  player: { width: '100%', height: '100%' },
  facts: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    textAlign: 'center',
    paddingHorizontal: Spacing.five,
  },
  footer: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  empty: {
    paddingTop: Spacing.five,
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.five,
    gap: Spacing.two + Spacing.half,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  centerText: { textAlign: 'center' },
});
