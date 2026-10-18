import { StyleSheet, View } from 'react-native';

import { Reel } from '@/shared/ui/reel';
import { SnaplyButton } from '@/shared/ui/snaply-button';

import type { SocialProviderMeta } from '../model/social-provider';
import { ProviderIcon } from './provider-icon';

type SocialLoginButtonProps = {
  provider: SocialProviderMeta;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function SocialLoginButton({
  provider,
  loading = false,
  disabled = false,
  onPress,
}: SocialLoginButtonProps) {
  // The provider's own colours on the app's ticket: the brand is theirs, the
  // shape is the app's.
  return (
    <SnaplyButton
      title={provider.label}
      accessibilityLabel={provider.label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      colors={{
        face: provider.backgroundColor,
        label: provider.textColor,
        perforation: provider.borderColor,
      }}
      leading={
        loading ? (
          <Reel color={provider.textColor} size={18} />
        ) : (
          <View style={styles.icon}>
            <ProviderIcon provider={provider.id} />
          </View>
        )
      }
      style={{ transform: [{ rotate: '-0.4deg' }] }}
    />
  );
}

const styles = StyleSheet.create({
  icon: { width: 20, alignItems: 'center' },
});
