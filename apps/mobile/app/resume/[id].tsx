import { copy } from '@zhiyou/shared';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { FlowScreen } from '../../components/FlowScreen';
import { NavAction, NavBar } from '../../components/NavBar';
import { PaperPreview } from '../../components/PaperPreview';
import { useResume } from '../../lib/queries';
import { useExportPdf } from '../../lib/useExportPdf';

/** 简历预览（截图 16）：按当前模版渲染的完整简历纸，右上角导出。 */
export default function ResumeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: resume } = useResume(id ?? '');
  const exportPdf = useExportPdf();

  const handleExport = useCallback(() => {
    if (!resume) return;
    void exportPdf({
      content: resume.content,
      templateKey: resume.templateKey,
      title: resume.title,
    });
  }, [exportPdf, resume]);

  return (
    <FlowScreen testID="screen-resume">
      <NavBar
        title={copy.resume.title}
        right={
          resume ? (
            <NavAction
              label={copy.common.export}
              onPress={handleExport}
              testID="resume-export"
            />
          ) : undefined
        }
      />

      {resume ? (
        <PaperPreview
          content={resume.content}
          templateKey={resume.templateKey}
          scrollEnabled
          testID="resume-paper"
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
