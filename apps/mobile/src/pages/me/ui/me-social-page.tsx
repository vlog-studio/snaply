import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { needsReconnect, useSnsConnection } from '@/entities/sns-connection';
import { useConnectSns } from '@/features/connect-sns';
import { MaxContentWidth, Radius, Spacing, ThemeScope, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { RowDivider, SettingRow, SettingsSection } from './rows';

/**
 * The 소셜 연결 screen (`/settings/social`) — linking the Instagram account a
 * finished movie can be posted to (SNS-1, SNS-8).
 *
 * The row reads the link's state and its trailing word is the one thing to do
 * about it: 연결, 다시 연결 when the access has run out (or nobody knows when),
 * or 연결 해제. Only that word is pressable — unlinking asks nothing, because
 * linking again undoes it, so a stray tap on the row must not do it.
 *
 * TikTok stays 준비 중 with nothing to press: posting there is blocked on the
 * media host's verification, and a link that cannot post is a promise this
 * screen cannot keep.
 */
export function MeSocialPage() {
  const theme = useTheme();
  const instagram = useSnsConnection('instagram');
  const actions = useConnectSns();
  const [now] = useState(Date.now);

  const linked = instagram.connection;
  const stale = linked ? needsReconnect(linked, now) : false;
  const handle = linked?.username ? `@${linked.username}` : '연결됨';

  const readOut = !instagram.isLoaded
    ? instagram.isError
      ? '연결 상태를 불러오지 못했어요'
      : undefined
    : linked
      ? stale
        ? `${handle} · 다시 연결이 필요해요`
        : handle
      : '프로페셔널 계정만 연결할 수 있어요';

  const action = !instagram.isLoaded
    ? undefined
    : actions.pending === 'connect'
      ? { label: '연결하는 중…', run: undefined }
      : actions.pending === 'disconnect'
        ? { label: '해제하는 중…', run: undefined }
        : !linked
          ? { label: '연결', run: () => void actions.connect('instagram') }
          : stale
            ? { label: '다시 연결', run: () => void actions.connect('instagram') }
            : { label: '연결 해제', run: () => void actions.disconnect('instagram') };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <SettingsSection>
        <SettingRow
          icon="logo-instagram"
          title="Instagram"
          sub={readOut}
          right={
            action ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Instagram ${action.label}`}
                accessibilityState={{ disabled: !action.run, busy: !action.run }}
                disabled={!action.run}
                onPress={action.run}
                hitSlop={Spacing.two}
                style={({ pressed }) => ({ opacity: !action.run ? 0.6 : pressed ? 0.7 : 1 })}
              >
                <ThemedText selectable={false} type="smallBold" themeColor="cherryInk">
                  {action.label}
                </ThemedText>
              </Pressable>
            ) : undefined
          }
        />
        <RowDivider />
        <SettingRow icon="logo-tiktok" title="TikTok" sub="준비 중" />
      </SettingsSection>

      {actions.error ? (
        <View
          style={[styles.notice, { borderColor: theme.border, backgroundColor: theme.warmSurface }]}
        >
          <ThemeScope scheme="light">
            <ThemedText type="small">{actions.error}</ThemedText>
          </ThemeScope>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.eight,
    gap: Spacing.five,
  },
  notice: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    padding: Spacing.three,
  },
});
