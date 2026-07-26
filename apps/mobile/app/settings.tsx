import { copy } from '@zhiyou/shared';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';

import { FlowScreen } from '../components/FlowScreen';
import { NavBar } from '../components/NavBar';
import { useToast } from '../components/Toast';
import { BriefcaseIcon, SettingsIcon, UserIcon } from '../components/icons';
import { Card, ListCard, ListRow } from '../components/ui';
import { useAuth } from '../lib/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import { colors, radius, spacing } from '../theme';

/**
 * 设置。
 *
 * 原型里这一项是 toast 占位。有了认证之后「退出登录」是必需项，
 * 所以做成一个最小可用页：通知 / 隐私 / 账号 + 退出登录。
 */
export default function SettingsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const confirmSignOut = useCallback(() => {
    Alert.alert(copy.settings.signOut, copy.settings.signOutConfirm, [
      { text: copy.common.cancel, style: 'cancel' },
      {
        text: copy.settings.signOut,
        style: 'destructive',
        onPress: () => {
          setSigningOut(true);
          void (async () => {
            try {
              await signOut();
              router.replace('/(auth)/sign-in');
            } catch {
              toast.show(copy.errors.generic);
            } finally {
              setSigningOut(false);
            }
          })();
        },
      },
    ]);
  }, [router, signOut, toast]);

  return (
    <FlowScreen testID="screen-settings">
      <NavBar title={copy.settings.title} />

      <ListCard>
        <ListRow
          first
          icon={<SettingsIcon size={20} />}
          title={copy.settings.notifications}
          onPress={() => toast.show(copy.errors.generic)}
          testID="settings-notifications"
        />
        <ListRow
          icon={<BriefcaseIcon size={20} />}
          title={copy.settings.privacy}
          onPress={() => toast.show(copy.errors.generic)}
          testID="settings-privacy"
        />
        <ListRow
          icon={<UserIcon size={20} color={colors.primary} />}
          title={copy.settings.account}
          onPress={() => router.push('/profile/edit')}
          testID="settings-account"
        />
      </ListCard>

      {isSupabaseConfigured ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: signingOut }}
          testID="settings-sign-out"
          disabled={signingOut}
          onPress={confirmSignOut}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Card style={styles.signOutCard}>
            <Text style={styles.signOutLabel}>{copy.settings.signOut}</Text>
          </Card>
        </Pressable>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  signOutCard: {
    alignItems: 'center',
    paddingVertical: spacing.card,
    borderRadius: radius.card,
  },
  signOutLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
  },
  pressed: {
    opacity: 0.6,
  },
});
