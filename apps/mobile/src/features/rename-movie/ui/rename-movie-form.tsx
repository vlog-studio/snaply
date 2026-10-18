import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { MovieTitleMaxLength, useRenameMovie } from '@/entities/movie';
import { FormTextField } from '@/shared/ui/form-text-field';
import { SnaplyButton } from '@/shared/ui/snaply-button';
import { Spacing } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

import { renameMovieSchema, type RenameMovieValues } from '../model/rename-movie-schema';

export type RenameMovieFormProps = {
  movieId: string;
  /** The name to open on. */
  title: string;
  /** The user backed out; nothing was written. */
  onCancel: () => void;
  /** The new name was written to the store. */
  onSaved: () => void;
};

/**
 * The rename form itself, apart from any sheet — so a host that already has a
 * modal open can show it in place instead of closing one modal to open
 * another, which drops the second one on iOS. Today the movie screen opens
 * `RenameMovieSheet`; the split survives for the next such host.
 *
 * The form is mounted with the movie's current name as its default, so hosts
 * key it by `movieId` (or mount it fresh per opening) to reset the field.
 * Clearing the field is a valid submission: the movie goes back to being called
 * after the day it was started.
 */
export function RenameMovieForm({ movieId, title, onCancel, onSaved }: RenameMovieFormProps) {
  const renameMovie = useRenameMovie();
  const { control, handleSubmit } = useForm<RenameMovieValues>({
    resolver: zodResolver(renameMovieSchema),
    defaultValues: { title },
  });

  const submit = handleSubmit((values) => {
    renameMovie(movieId, values.title);
    onSaved();
  });

  return (
    <View style={styles.form}>
      <ThemedText type="subtitle" accessibilityRole="header">
        이름 바꾸기
      </ThemedText>
      <FormTextField
        control={control}
        name="title"
        label="무비 이름"
        placeholder="비워두면 만든 날짜로 지어요"
        maxLength={MovieTitleMaxLength}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <View style={styles.actions}>
        <SnaplyButton
          variant="secondary"
          title="취소"
          accessibilityLabel="이름 바꾸기 취소"
          onPress={onCancel}
          style={styles.cancel}
        />
        <SnaplyButton title="저장" onPress={() => void submit()} style={styles.save} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.two + Spacing.half },
  save: { flex: 1 },
  cancel: { flexBasis: '36%' },
});
