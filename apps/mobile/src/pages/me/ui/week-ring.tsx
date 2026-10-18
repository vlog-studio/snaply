import { StyleSheet, View } from 'react-native';

import { Fonts, Shadows, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { recordedDayCount, type WeekDayRecord } from '../model/week-record';

/**
 * The 나 tab's hero: this week's record as a ring of seven day stickers,
 * Monday at the top going clockwise — cherry on the days a snap was captured,
 * a dashed outline on the rest, today ringed in ink — around a paper disc with
 * the user's initial in hand lettering.
 *
 * Not animated and not interactive — it is a read-out, the same standing the
 * old stat card had, drawn in the shape the app is named after.
 */
export function WeekRing({
  days,
  initial,
  size,
}: {
  days: readonly WeekDayRecord[];
  initial: string;
  size: number;
}) {
  const theme = useTheme();
  // Seven round day stickers around the face, Monday at twelve o'clock: a
  // recorded day is a cherry sticker with a stitched edge, an empty one a
  // dashed outline, today ringed in ink.
  const center = size / 2;
  const orbit = (size - DaySize) / 2;
  const faceSize = size - DaySize * 2 - 8;

  return (
    <View
      accessible
      accessibilityLabel={`이번 주 7일 중 ${recordedDayCount(days)}일 기록`}
      style={{ width: size, height: size }}
    >
      <View
        style={[
          styles.face,
          {
            width: faceSize,
            height: faceSize,
            borderRadius: faceSize / 2,
            left: center - faceSize / 2,
            top: center - faceSize / 2,
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
            boxShadow: Shadows.paper(theme.shadowInk),
          },
        ]}
      >
        <ThemedText selectable={false} style={styles.initial}>
          {initial}
        </ThemedText>
      </View>
      {days.map((day, index) => {
        const angle = (-90 + (index * 360) / days.length) * (Math.PI / 180);
        return (
          <View
            key={day.label}
            style={[
              styles.day,
              {
                left: center + orbit * Math.cos(angle) - DaySize / 2,
                top: center + orbit * Math.sin(angle) - DaySize / 2,
              },
              day.recorded
                ? { backgroundColor: theme.primary, boxShadow: Shadows.paper(theme.shadowInk) }
                : [styles.dayOff, { borderColor: theme.textSecondary }],
              day.isToday && [styles.today, { outlineColor: theme.text }],
            ]}
          >
            {day.recorded ? <View style={styles.stitch} /> : null}
            <ThemedText
              selectable={false}
              type="xsmall"
              style={[
                styles.dayLabel,
                { color: day.recorded ? theme.onPrimary : theme.textSecondary },
              ]}
            >
              {day.label}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

const DaySize = 30;

const styles = StyleSheet.create({
  face: {
    position: 'absolute',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontFamily: Fonts.hand, fontWeight: 700, fontSize: 40, lineHeight: 44 },
  day: {
    position: 'absolute',
    width: DaySize,
    height: DaySize,
    borderRadius: DaySize / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOff: { borderWidth: 2, borderStyle: 'dashed' },
  today: { outlineWidth: 2, outlineStyle: 'solid', outlineOffset: 2 },
  stitch: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
    borderRadius: DaySize / 2 - 3,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.7)',
  },
  dayLabel: { fontWeight: 700 },
});
