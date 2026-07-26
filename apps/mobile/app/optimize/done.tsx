import { copy } from '@zhiyou/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FlowScreen } from '../../components/FlowScreen';
import { NavAction, NavBar } from '../../components/NavBar';
import { useToast } from '../../components/Toast';
import { CheckIcon } from '../../components/icons';
import { GhostButton, PrimaryButton } from '../../components/ui';
import { useOptimizeFlow } from '../../lib/optimizeFlow';
import { queryKeys } from '../../lib/queries';
import { useExportPdf } from '../../lib/useExportPdf';
import { colors, typography } from '../../theme';

/**
 * 完成（截图 15）。
 *
 * 右上角「完成」清空导航栈回首页（DESIGN-SPEC §2），同时把结果落库：
 * 首页简历分同步更新，记录列表头部插入新条目（§5.3）。
 */
export default function DoneScreen() {
  const router = useRouter();
  const toast = useToast();
  const flow = useOptimizeFlow();
  const queryClient = useQueryClient();
  const exportPdf = useExportPdf();

  const gain = flow.scoreAfter - flow.scoreBefore;

  const finish = useCallback(async () => {
    await flow.commit();
    // 首页分数与记录列表都要跟着变
    await queryClient.invalidateQueries({ queryKey: queryKeys.home });
    await queryClient.invalidateQueries({ queryKey: queryKeys.records });
    await queryClient.invalidateQueries({ queryKey: queryKeys.resumes });
    flow.reset();
    router.dismissAll();
    toast.show(copy.done.saved);
  }, [flow, queryClient, router, toast]);

  const handleExport = useCallback(() => {
    if (!flow.resultContent) return;
    void exportPdf({
      content: flow.resultContent,
      templateKey: flow.resultTemplateKey,
      title: flow.resumeTitle,
    });
  }, [exportPdf, flow]);

  return (
    <FlowScreen testID="screen-done">
      <NavBar
        hideBack
        right={
          <NavAction
            label={copy.common.done}
            onPress={() => void finish()}
            testID="done-finish"
          />
        }
      />

      <View style={styles.center}>
        <View style={styles.bigCheck}>
          <CheckIcon size={36} color={colors.success} />
        </View>

        <Text style={styles.title} accessibilityRole="header">
          {copy.done.title}
        </Text>

        <Text style={styles.summary} testID="done-summary">
          {flow.adoptedCount > 0
            ? copy.done.summary(flow.adoptedCount, flow.jobTitle, flow.company)
            : copy.done.summaryNoneAdopted}
        </Text>

        <View style={styles.deltaRow}>
          <Text style={styles.oldScore}>{flow.scoreBefore}</Text>
          <Text style={styles.arrow}>→</Text>
          <Text style={styles.newScore} testID="done-new-score">
            {flow.scoreAfter}
          </Text>
          {gain > 0 ? (
            <Text style={styles.gain} testID="done-gain">
              {copy.done.gain(gain)}
            </Text>
          ) : null}
        </View>

        <View style={styles.buttons}>
          <PrimaryButton
            label={copy.done.exportPdf}
            onPress={handleExport}
            testID="done-export"
          />
          <GhostButton
            label={copy.done.previewResume}
            onPress={() => router.push('/resume/preview')}
            testID="done-preview"
          />
        </View>
      </View>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 30,
  },
  bigCheck: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: colors.tint.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.doneTitle.fontSize,
    fontWeight: typography.doneTitle.fontWeight,
    color: colors.text.primary,
    marginTop: 18,
  },
  summary: {
    fontSize: 14,
    lineHeight: 22.4,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: 8,
  },

  deltaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 14,
    marginTop: 26,
  },
  oldScore: {
    fontSize: typography.scoreOld.fontSize,
    fontWeight: typography.scoreOld.fontWeight,
    color: colors.text.quaternary,
  },
  arrow: {
    fontSize: 22,
    color: colors.text.quaternary,
  },
  newScore: {
    fontSize: typography.scoreBig.fontSize,
    fontWeight: typography.scoreBig.fontWeight,
    letterSpacing: typography.scoreBig.letterSpacing,
    color: colors.primary,
  },
  gain: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.successText,
    backgroundColor: colors.tint.successSoft,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'center',
    overflow: 'hidden',
  },

  buttons: {
    width: '100%',
    marginTop: 34,
    gap: 6,
  },
});
