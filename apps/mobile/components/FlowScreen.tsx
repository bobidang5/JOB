import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';

/**
 * 流程页容器（新建简历、粘贴 JD、匹配度、优化建议…）。
 *
 * 与一级页的区别：没有 Dock，所以底部不留 dock.contentInset；模块间距是
 * 12–14 而不是 16（DESIGN-SPEC §3.3）。
 */
export function FlowScreen({
  children,
  style,
  gap = spacing.flowGap,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      testID={testID}
      style={[
        styles.screen,
        { paddingTop: insets.top + 10, paddingBottom: Math.max(insets.bottom, 14) },
        { gap },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.screen,
    paddingHorizontal: spacing.screenX,
  },
});
