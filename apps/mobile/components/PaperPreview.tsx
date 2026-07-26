import {
  renderResumeDocument,
  type ResumeContent,
  type ResumeTemplateKey,
} from '@zhiyou/shared';
import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

import { colors, radius, shadows } from '../theme';

/**
 * 简历纸预览。
 *
 * 用 WebView 渲染 packages/shared 的 renderResumeDocument —— 与导出 PDF
 * 用的是同一份 HTML 与同一套 CSS，只是模式不同。四种版式因此不可能出现
 * 「预览好看、导出走样」。
 *
 * 简历纸是纯展示、没有交互，所以直接关掉 JavaScript：内容里既有用户
 * 上传的文字也有模型生成的文字，没有理由让它们能执行脚本。
 */
export function PaperPreview({
  content,
  templateKey,
  style,
  scrollEnabled = false,
  testID,
}: {
  content: ResumeContent;
  templateKey: ResumeTemplateKey;
  style?: StyleProp<ViewStyle>;
  scrollEnabled?: boolean;
  testID?: string;
}) {
  const html = useMemo(
    () => renderResumeDocument(content, templateKey, 'preview'),
    [content, templateKey],
  );

  return (
    <View style={[styles.container, style]} testID={testID}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled={false}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
        style={styles.webview}
        // 简历纸自己带白底，避免加载时闪一下深色
        backgroundColor={colors.bg.card}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: radius.input,
    overflow: 'hidden',
    backgroundColor: colors.bg.card,
    ...shadows.card,
  },
  webview: {
    flex: 1,
    backgroundColor: colors.bg.card,
  },
});
