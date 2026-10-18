import { NoticeBand } from '@/shared/ui/notice';

export type LeftOutNoticeProps = {
  count: number;
  onReAdd: () => void;
  onDismiss: () => void;
};

/**
 * How many handed-over snaps the edit draft did not put in, and the way back
 * for them (MOV-21). No reason is given — what the draft judged is not the
 * user's to argue with, and putting a snap back costs one tap, so nothing is
 * lost by not saying why.
 */
export function LeftOutNotice({ count, onReAdd, onDismiss }: LeftOutNoticeProps) {
  return (
    <NoticeBand
      message={`스냅 ${count}개는 넣지 않았어요`}
      action={{
        label: '다시 넣기',
        accessibilityLabel: `넣지 않은 스냅 ${count}개 다시 넣기`,
        onPress: onReAdd,
      }}
      onDismiss={onDismiss}
    />
  );
}
