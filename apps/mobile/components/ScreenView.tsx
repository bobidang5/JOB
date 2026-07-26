import React from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, dock, spacing } from '../theme';
import { BottomGlow } from './ui';

/**
 * 一级页容器（首页 / 记录 / 我的）。
 *
 * 三件事：
 *   1. 底部蓝色辉光（原型 .bglow）
 *   2. 底部留出 dock.contentInset 的空白，让内容能从玻璃 Dock 下方穿过
 *      而不是被它盖住——截图 01 的「最近记录」卡片正是这个效果
 *   3. flexGrow:1 的滚动容器，这样子元素仍可用 marginTop:'auto' 把
 *      主按钮顶到底部（原型 #homeCTA 的 margin-top:auto），同时在小屏
 *      上内容超出时还能滚
 */
export function ScreenView({
  children,
  style,
  contentStyle,
  scrollable = true,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  scrollable?: boolean;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();

  const padding = {
    paddingTop: insets.top + 10,
    paddingBottom: dock.contentInset,
  };

  if (!scrollable) {
    return (
      <View testID={testID} style={[styles.screen, style]}>
        <BottomGlow />
        <View style={[styles.content, padding, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <View testID={testID} style={[styles.screen, style]}>
      <BottomGlow />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, padding, contentStyle]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.screen,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.screenX,
    gap: spacing.gap,
  },
});
