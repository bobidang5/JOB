import { copy } from '@zhiyou/shared';
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { FlowScreen } from '../../components/FlowScreen';
import { NavAction, NavBar } from '../../components/NavBar';
import { PaperPreview } from '../../components/PaperPreview';
import { useOptimizeFlow } from '../../lib/optimizeFlow';
import { useExportPdf } from '../../lib/useExportPdf';

/**
 * 完成页的「预览简历」。
 *
 * 单独一屏而不是复用 /resume/[id]：此刻采纳结果还没落库（要等用户点
 * 「完成」），数据库里那份仍是旧内容。这里直接渲染 flow 里已经应用过
 * 采纳项的版本，所见即所得。
 */
export default function OptimizedPreviewScreen() {
  const flow = useOptimizeFlow();
  const exportPdf = useExportPdf();

  const handleExport = useCallback(() => {
    if (!flow.resultContent) return;
    void exportPdf({
      content: flow.resultContent,
      templateKey: flow.resultTemplateKey,
      title: flow.resumeTitle,
    });
  }, [exportPdf, flow]);

  return (
    <FlowScreen testID="screen-optimized-preview">
      <NavBar
        title={copy.resume.title}
        right={
          flow.resultContent ? (
            <NavAction
              label={copy.common.export}
              onPress={handleExport}
              testID="preview-export"
            />
          ) : undefined
        }
      />

      {flow.resultContent ? (
        <PaperPreview
          content={flow.resultContent}
          templateKey={flow.resultTemplateKey}
          scrollEnabled
          testID="preview-paper"
        />
      ) : null}

      <View style={styles.footerSpace} />
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  footerSpace: {
    height: 14,
    flexShrink: 0,
  },
});
