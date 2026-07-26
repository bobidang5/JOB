import { copy } from '@zhiyou/shared';
import * as AppleAuthentication from 'expo-apple-authentication';
import React, { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '../../components/Toast';
import { SparkIcon } from '../../components/icons';
import { BottomGlow, IconCircle } from '../../components/ui';
import { AuthCancelledError, useAuth, type OAuthProvider } from '../../lib/auth';
import { colors, radius, spacing, typography } from '../../theme';

/**
 * 登录页。
 *
 * 原型的 16 张截图全是已登录态，没有这一屏，所以这是唯一超出原型的
 * 新增界面。视觉语言完全沿用原型：#F7F7FA 底、底部蓝色辉光、32pt/800
 * 大标题、16 圆角按钮、20 圆角卡片。
 *
 * Apple 那颗按钮用的是 AppleAuthenticationButton —— Apple 的人机界面
 * 指南要求使用他们自己的按钮样式，自绘会被拒。其余三家用纯文字按钮：
 * 各平台的品牌 logo 需要各自的官方素材与用法授权，不该随手画一个。
 */
export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { signInWithOAuth, signInWithApple, isAppleAvailable } = useAuth();
  const [pending, setPending] = useState<string | null>(null);

  const run = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setPending(key);
      try {
        await action();
      } catch (error) {
        toast.show(
          error instanceof AuthCancelledError
            ? copy.auth.cancelled
            : copy.auth.failed,
        );
      } finally {
        setPending(null);
      }
    },
    [toast],
  );

  const oauth = (provider: OAuthProvider, label: string, testID: string) => (
    <Pressable
      key={provider}
      accessibilityRole="button"
      accessibilityState={{ disabled: pending !== null }}
      testID={testID}
      disabled={pending !== null}
      onPress={() => void run(provider, () => signInWithOAuth(provider))}
      style={({ pressed }) => [
        styles.providerButton,
        pressed && styles.pressed,
        pending !== null && pending !== provider && styles.dimmed,
      ]}
    >
      <Text style={styles.providerLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.screen} testID="screen-sign-in">
      <BottomGlow />

      <View style={[styles.content, { paddingTop: insets.top + 60 }]}>
        <View style={styles.brand}>
          <IconCircle size={64}>
            <SparkIcon size={30} />
          </IconCircle>
          <Text style={styles.title} accessibilityRole="header">
            {copy.app.name}
          </Text>
          <Text style={styles.tagline}>{copy.auth.tagline}</Text>
        </View>

        <View style={styles.buttons}>
          {Platform.OS === 'ios' && isAppleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
              }
              buttonStyle={
                AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={radius.button}
              style={styles.appleButton}
              onPress={() => void run('apple', signInWithApple)}
            />
          ) : null}

          {oauth('google', copy.auth.continueWithGoogle, 'sign-in-google')}
          {oauth('linkedin_oidc', copy.auth.continueWithLinkedIn, 'sign-in-linkedin')}
          {oauth('facebook', copy.auth.continueWithFacebook, 'sign-in-facebook')}
        </View>

        <Text style={[styles.legal, { marginBottom: insets.bottom + 16 }]}>
          {copy.auth.legal}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.screen,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.screenX,
  },
  brand: {
    alignItems: 'center',
    gap: 14,
  },
  title: {
    fontSize: typography.bigTitle.fontSize,
    fontWeight: typography.bigTitle.fontWeight,
    letterSpacing: typography.bigTitle.letterSpacing,
    color: colors.text.primary,
  },
  tagline: {
    fontSize: 14,
    color: colors.text.secondary,
  },

  buttons: {
    marginTop: 'auto',
    gap: 10,
  },
  appleButton: {
    height: 52,
  },
  providerButton: {
    height: 52,
    backgroundColor: colors.bg.card,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerLabel: {
    fontSize: typography.button.fontSize,
    fontWeight: typography.button.fontWeight,
    color: colors.text.primary,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  dimmed: {
    opacity: 0.4,
  },

  legal: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 19,
    color: colors.text.tertiary,
    marginTop: 20,
  },
});
