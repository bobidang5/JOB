import React from 'react';
import {
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors, radius, spacing, typography } from '../theme';
import { ChevronIcon } from './icons';

/* ------------------------------------------------------------------ */
/* 卡片                                                                */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  style,
  padded = true,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 列表型卡片自己控制行内边距，这里要关掉外层 padding */
  padded?: boolean;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[styles.card, padded && styles.cardPadded, style]}>
      {children}
    </View>
  );
}

/** 列表型卡片：内部由 ListRow 提供行内边距与分隔线 */
export function ListCard({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[styles.card, styles.listCard, style]}>
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* 按压反馈：原型的 .btn:active{transform:scale(.97)}                   */
/* ------------------------------------------------------------------ */

export function Tappable({
  children,
  style,
  scaleOnPress = true,
  ...rest
}: PressableProps & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleOnPress?: boolean;
}) {
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [
        style,
        pressed && scaleOnPress ? styles.pressed : null,
        pressed && !scaleOnPress ? styles.pressedDim : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* 按钮                                                                */
/* ------------------------------------------------------------------ */

export function PrimaryButton({
  label,
  onPress,
  disabled,
  style,
  testID,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      onPress={disabled ? undefined : onPress}
      style={[styles.primaryButton, disabled && styles.primaryButtonDisabled, style]}
    >
      <Text style={styles.primaryButtonLabel}>{label}</Text>
    </Tappable>
  );
}

export function GhostButton({
  label,
  onPress,
  style,
  testID,
}: {
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <Tappable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      scaleOnPress={false}
      style={[styles.ghostButton, style]}
    >
      <Text style={styles.ghostButtonLabel}>{label}</Text>
    </Tappable>
  );
}

/* ------------------------------------------------------------------ */
/* 列表行（截图 01/04/13 的行）                                        */
/* ------------------------------------------------------------------ */

export function IconCircle({
  children,
  size = 40,
  background = colors.tint.faint,
}: {
  children: React.ReactNode;
  size?: number;
  background?: string;
}) {
  return (
    <View
      style={[
        styles.iconCircle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
      ]}
    >
      {children}
    </View>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  right,
  showChevron = true,
  onPress,
  first = false,
  compact = false,
  testID,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  /** 右侧自定义内容，如记录行的「76 → 84」 */
  right?: React.ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
  /** 卡片内第一行不画上分隔线 */
  first?: boolean;
  /** 首页「最近记录」与匹配度页的缺失关键词行更矮一点 */
  compact?: boolean;
  testID?: string;
}) {
  const content = (
    <View
      style={[
        styles.row,
        compact && styles.rowCompact,
        !first && styles.rowDivider,
      ]}
    >
      {icon ? <IconCircle>{icon}</IconCircle> : null}
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, compact && styles.rowTitleCompact]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
      {showChevron ? <ChevronIcon /> : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Tappable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      scaleOnPress={false}
    >
      {content}
    </Tappable>
  );
}

/* ------------------------------------------------------------------ */
/* 一级页大标题                                                        */
/* ------------------------------------------------------------------ */

export function BigTitle({
  title,
  subtitle,
  style,
}: {
  title: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.bigTitle, style]}>
      <Text accessibilityRole="header" style={styles.bigTitleText}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.bigTitleSub}>{subtitle}</Text> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* 底部蓝色辉光（原型 .bglow）                                          */
/* ------------------------------------------------------------------ */

export function BottomGlow() {
  return (
    <View pointerEvents="none" style={styles.glowWrapper}>
      <Svg width={360} height={190}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.17} />
            <Stop offset="72%" stopColor={colors.primary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={360} height={190} fill="url(#glow)" />
      </Svg>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* 空态                                                                */
/* ------------------------------------------------------------------ */

export function EmptyNote({ text, testID }: { text: string; testID?: string }) {
  return (
    <Text testID={testID} style={styles.emptyNote}>
      {text}
    </Text>
  );
}

/* ------------------------------------------------------------------ */
/* 富文本：把 i18n 里 **包裹** 的片段渲染为强调                        */
/* ------------------------------------------------------------------ */

/**
 * 原型用 <b> 标出匹配度页的关键数字（「已满足 **12** 项职位要求」）。
 * 文案要留在 i18n 里，所以约定用 ** 标记，由这里切分渲染——避免把
 * 句子拆成碎片散落在组件里，将来翻译时语序也调得动。
 */
export function RichText({
  text,
  style,
  strongStyle,
  testID,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  strongStyle?: StyleProp<TextStyle>;
  testID?: string;
}) {
  const parts = text.split('**');
  return (
    <Text style={style} testID={testID}>
      {parts.map((part, index) =>
        // 奇数下标就是被 ** 包住的片段
        index % 2 === 1 ? (
          <Text key={index} style={strongStyle}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

/* ------------------------------------------------------------------ */
/* 徽标（「新手推荐」/「推荐」）                                        */
/* ------------------------------------------------------------------ */

export function Badge({ label, style }: { label: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.badge, style]}>{label}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.card,
  },
  cardPadded: {
    padding: spacing.card,
  },
  listCard: {
    paddingVertical: 4,
  },

  pressed: {
    transform: [{ scale: 0.97 }],
  },
  pressedDim: {
    opacity: 0.6,
  },

  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonLabel: {
    color: '#FFFFFF',
    fontSize: typography.button.fontSize,
    fontWeight: typography.button.fontWeight,
  },

  ghostButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.secondary,
  },

  iconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: spacing.rowY,
    paddingHorizontal: spacing.card,
  },
  rowCompact: {
    paddingVertical: 13,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider.row,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: typography.rowTitle.fontSize,
    fontWeight: typography.rowTitle.fontWeight,
    color: colors.text.primary,
  },
  rowTitleCompact: {
    fontSize: 15,
  },
  rowSubtitle: {
    fontSize: typography.rowSub.fontSize,
    color: colors.text.secondary,
    marginTop: 2,
  },

  bigTitle: {
    paddingTop: 12,
    paddingHorizontal: 2,
  },
  bigTitleText: {
    fontSize: typography.bigTitle.fontSize,
    fontWeight: typography.bigTitle.fontWeight,
    letterSpacing: typography.bigTitle.letterSpacing,
    color: colors.text.primary,
  },
  bigTitleSub: {
    fontSize: typography.bigTitleSub.fontSize,
    color: colors.text.secondary,
    marginTop: 5,
  },

  glowWrapper: {
    position: 'absolute',
    bottom: -36,
    left: '50%',
    marginLeft: -180,
    width: 360,
    height: 190,
  },

  emptyNote: {
    textAlign: 'center',
    color: colors.text.tertiary,
    fontSize: 13.5,
    lineHeight: 24,
    paddingVertical: 60,
  },

  badge: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: 'rgba(0,122,255,0.10)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
});
