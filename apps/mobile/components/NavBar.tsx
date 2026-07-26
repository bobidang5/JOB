import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '../theme';
import { BackIcon } from './icons';

/**
 * 流程页顶部导航（原型 .nav）：左侧白色圆形返回钮、居中标题、右侧可选操作。
 * 高度 44，返回钮 34。
 */
export function NavBar({
  title,
  onBack,
  hideBack = false,
  right,
  testID,
}: {
  title?: string;
  /** 不传则默认 router.back()。分析页要覆盖成回首页（DESIGN-SPEC §5.2）。 */
  onBack?: () => void;
  hideBack?: boolean;
  right?: React.ReactNode;
  testID?: string;
}) {
  const router = useRouter();

  return (
    <View style={styles.nav} testID={testID}>
      {hideBack ? (
        <View style={styles.spacer} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          testID="nav-back"
          onPress={onBack ?? (() => router.back())}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <BackIcon size={18} />
        </Pressable>
      )}

      <Text style={styles.title} numberOfLines={1}>
        {title ?? ''}
      </Text>

      {right ?? <View style={styles.spacer} />}
    </View>
  );
}

/** 右侧的文字操作：「保存」「导出」「完成」是蓝色，「1 / 4」是灰色。 */
export function NavAction({
  label,
  onPress,
  tone = 'primary',
  testID,
}: {
  label: string;
  onPress?: () => void;
  tone?: 'primary' | 'muted';
  testID?: string;
}) {
  const content = (
    <Text
      style={[
        styles.action,
        tone === 'primary' ? styles.actionPrimary : styles.actionMuted,
      ]}
    >
      {label}
    </Text>
  );

  if (!onPress) return <View style={styles.actionBox}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.actionBox, pressed && styles.backPressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  nav: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  back: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bg.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPressed: {
    opacity: 0.55,
  },
  spacer: {
    width: 34,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.navTitle.fontSize,
    fontWeight: typography.navTitle.fontWeight,
    color: colors.text.primary,
  },
  actionBox: {
    width: 54,
    alignItems: 'flex-end',
  },
  action: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionPrimary: {
    color: colors.primary,
  },
  actionMuted: {
    color: colors.text.secondary,
  },
});
