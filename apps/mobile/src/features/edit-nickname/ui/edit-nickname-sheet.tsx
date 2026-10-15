import { zodResolver } from '@hookform/resolvers/zod';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { FormTextField } from '@/shared/ui/form-text-field';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { NicknameMaxLength, nicknameSchema, type NicknameValues } from '../model/nickname-schema';
import { useSaveNickname } from '../model/use-nickname';

export type EditNicknameSheetProps = {
  visible: boolean;
  /** The name to open on — what the 나 tab shows now. */
  name: string;
  onClose: () => void;
};

/**
 * Changing the name the 나 tab shows (ACC-5). The form is mounted with the
 * current name as its default, so the host mounts the sheet fresh per opening.
 * A failed save keeps the sheet open with the typed name and says so; the
 * server's own text is never shown.
 */
export function EditNicknameSheet({ visible, name, onClose }: EditNicknameSheetProps) {
  const theme = useTheme();
  const save = useSaveNickname();
  const { control, handleSubmit } = useForm<NicknameValues>({
    resolver: zodResolver(nicknameSchema),
    defaultValues: { nickname: name },
  });

  // The button is disabled while saving, but the keyboard's done key is not —
  // and `isPending` only shows after a render, so a quick second press sent a
  // second PATCH (2026-10-14 review, backlog E-56).
  const saving = useRef(false);
  const submit = () => {
    if (saving.current) return;
    saving.current = true;
    void handleSubmit(
      (values) =>
        save.mutate(values.nickname, {
          onSuccess: onClose,
          onSettled: () => {
            saving.current = false;
          },
        }),
      () => {
        saving.current = false;
      },
    )();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel="이름 바꾸기">
      <View style={styles.form}>
        <ThemedText type="heading">이름 바꾸기</ThemedText>
        <FormTextField
          control={control}
          name="nickname"
          label="이름"
          placeholder="나 탭에 보일 이름"
          maxLength={NicknameMaxLength}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        {save.isError ? (
          <ThemedText type="small" themeColor="danger">
            이름을 저장하지 못했어요. 다시 시도해 주세요.
          </ThemedText>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이름 바꾸기 취소"
            onPress={onClose}
            style={[styles.cancel, { borderColor: theme.border }]}
          >
            <ThemedText selectable={false} type="button" themeColor="textSecondary">
              취소
            </ThemedText>
          </Pressable>
          <SnaplyButton
            title={save.isPending ? '저장하는 중…' : '저장'}
            disabled={save.isPending}
            onPress={submit}
            style={styles.save}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  save: { flex: 1 },
  cancel: {
    minHeight: 56,
    paddingHorizontal: Spacing.six,
    borderWidth: 1,
    borderRadius: Radius.small,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
