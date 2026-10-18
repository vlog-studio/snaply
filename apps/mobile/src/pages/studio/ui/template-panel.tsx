import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { TemplateOffer } from '@/features/fill-template';
import { PaperPiece, tiltFor } from '@/shared/ui/paper';
import { Shadows, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';
import { VideoFrame } from '@/shared/ui/video-frame';

export type TemplatePanelProps = {
  offers: TemplateOffer[];
  onOpen: (templateId: string) => void;
};

/**
 * Narrow enough that a third card reaches into the page's gutter on a phone —
 * two cards and a sliver, so the row reads as a row rather than as the whole
 * shelf.
 */
const CardWidth = 214;

/** The studio's own horizontal padding, which the row scrolls out through. */
const PageGutter = Spacing.five;

/**
 * The other way to start a movie: pick the shape first and let the app find the
 * material, instead of gathering material and deciding later.
 *
 * It sits beside the tray rather than replacing it, because the two answer
 * different questions — the tray is "these ones", a template is "something like
 * this" — and because the shortfall a card prints ("6컷 중 4컷 있어요") is the one thing
 * in the app that tells a user what to go out and shoot.
 *
 * The row scrolls out through the page's own padding: bleeding to the screen
 * edge is what makes the next card visible, and a card cut by the edge is the
 * only honest signal that there are more than the two that fit. The offers
 * arrive ordered by shortfall, so the two that fit are the two worth seeing.
 *
 * Each card leads with its slots as a strip — the user's own snap in every slot
 * the library fills, a dashed cell in every slot it cannot — so the shortfall
 * is seen rather than counted, and the empty cells are the shots to go and
 * take. Only the user's footage is ever drawn: an empty library draws every
 * cell dashed, never a sample. The strip is decoration to a screen reader; the
 * card's label already carries the same count.
 */
export function TemplatePanel({ offers, onOpen }: TemplatePanelProps) {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <ThemedText type="heading" style={styles.heading}>
        템플릿으로 시작
      </ThemedText>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.bleed}
        contentContainerStyle={styles.row}
      >
        {offers.map(({ template, filled, slotCount, slots }) => {
          const isComplete = filled === slotCount;
          return (
            <Pressable
              key={template.id}
              accessibilityRole="button"
              accessibilityLabel={`${template.name} · ${template.description} · ${slotCount}컷 중 ${filled}컷 있어요`}
              onPress={() => onOpen(template.id)}
              style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}
            >
              {/* A Guest Check strip torn off the pad, at the template's own lean. */}
              <PaperPiece edge="tornBottom" tilt={tiltFor(template.id, 1)} style={styles.check}>
                <View style={styles.strip}>
                  {template.slots.map((slot, index) => {
                    const snap = slots[index];
                    return snap ? (
                      // `VideoFrame` absolute-fills its parent, so the cell owns
                      // the size and the clipping.
                      <View
                        key={slot.id}
                        style={[
                          styles.slot,
                          {
                            borderColor: theme.backgroundElement,
                            backgroundColor: theme.media,
                            boxShadow: Shadows.paper(theme.shadowInk),
                          },
                        ]}
                      >
                        <VideoFrame uri={snap.uri} />
                      </View>
                    ) : (
                      <View
                        key={slot.id}
                        style={[
                          styles.slot,
                          styles.emptySlot,
                          { borderColor: theme.textSecondary },
                        ]}
                      />
                    );
                  })}
                </View>
                <ThemedText selectable={false} type="bodySm" style={styles.name} numberOfLines={1}>
                  {template.name}
                </ThemedText>
                <ThemedText
                  selectable={false}
                  type="small"
                  themeColor="textSecondary"
                  numberOfLines={2}
                  style={styles.description}
                >
                  {template.description}
                </ThemedText>
                {isComplete ? (
                  <View
                    style={[
                      styles.ready,
                      { backgroundColor: theme.mint, borderColor: theme.border },
                    ]}
                  >
                    <ThemedText
                      selectable={false}
                      type="xsmall"
                      style={{ color: theme.stickerInk }}
                    >
                      바로 만들 수 있어요
                    </ThemedText>
                  </View>
                ) : (
                  <ThemedText selectable={false} type="data" style={styles.count}>
                    {slotCount}컷 중 {filled}컷 있어요
                  </ThemedText>
                )}
              </PaperPiece>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.one },
  heading: { marginLeft: Spacing.four },
  bleed: { marginHorizontal: -PageGutter },
  // Room above and below for the cards' lean and shadow.
  row: { gap: Spacing.three, paddingHorizontal: PageGutter, paddingVertical: Spacing.three },
  card: { width: CardWidth },
  check: {
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
  },
  // One cell per slot, up to six across the card, square: each cut is a small
  // print pasted on the strip.
  strip: { flexDirection: 'row', gap: Spacing.one, marginBottom: Spacing.three - Spacing.half },
  slot: { width: 27, aspectRatio: 1, borderWidth: 2, overflow: 'hidden' },
  emptySlot: { borderWidth: 1.5, borderStyle: 'dashed' },
  name: { fontWeight: 700 },
  description: { minHeight: 40 },
  ready: {
    alignSelf: 'flex-start',
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderWidth: 1,
  },
  count: { marginTop: Spacing.two },
});
