import {
  MOCK_RESUME_SAMPLE,
  RESUME_TEMPLATE_KEYS,
  copy,
  type ResumeTemplateKey,
} from '@zhiyou/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { FlowScreen } from '../../../components/FlowScreen';
import { LoadingOverlay } from '../../../components/LoadingOverlay';
import { NavBar } from '../../../components/NavBar';
import { PaperPreview } from '../../../components/PaperPreview';
import { useToast } from '../../../components/Toast';
import { BackIcon, ForwardIcon } from '../../../components/icons';
import { PrimaryButton } from '../../../components/ui';
import * as api from '../../../lib/api';
import { queryKeys, useHomeSnapshot, useTemplates } from '../../../lib/queries';
import { colors, timings } from '../../../theme';

/**
 * 模版预览（截图 09）。
 *
 * 「示例内容 / 我的内容」分段切换；左右滑动或点箭头换模版，分页点同步；
 * 无简历的新用户默认显示示例内容（DESIGN-SPEC §5.5）。
 */
export default function TemplatePreviewScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { key } = useLocalSearchParams<{ key: string }>();
  const { data: templates } = useTemplates();
  const { data: home } = useHomeSnapshot();

  const initialIndex = Math.max(
    0,
    RESUME_TEMPLATE_KEYS.indexOf(key as ResumeTemplateKey),
  );
  const [index, setIndex] = useState(initialIndex);
  const [applying, setApplying] = useState(false);

  const myContent = home?.defaultResume?.content ?? null;
  const [mode, setMode] = useState<'sample' | 'mine'>(
    myContent ? 'mine' : 'sample',
  );

  const templateKey = RESUME_TEMPLATE_KEYS[index] ?? 'v1';
  const template = templates?.find((t) => t.key === templateKey);
  const content = mode === 'mine' && myContent ? myContent : MOCK_RESUME_SAMPLE;

  const step = useCallback((direction: number) => {
    setIndex(
      (prev) =>
        (prev + direction + RESUME_TEMPLATE_KEYS.length) %
        RESUME_TEMPLATE_KEYS.length,
    );
  }, []);

  // 左右滑动换模版（原型的 touchstart/touchend，阈值 50px）
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .onEnd((event) => {
          if (Math.abs(event.translationX) <= 50) return;
          step(event.translationX < 0 ? 1 : -1);
        })
        .runOnJS(true),
    [step],
  );

  const apply = useCallback(async () => {
    setApplying(true);
    try {
      // 已有简历换模版本质是换渲染版式，内容已是结构化数据，不需要 AI；
      // 保留遮罩是为了维持设计的节奏感。新用户从模版新建时才有真实的
      // AI 工作（用个人资料生成起始简历），见 /api/resumes/from-template。
      await new Promise((resolve) => setTimeout(resolve, timings.applyTemplate));
      await api.createResumeFromTemplate(templateKey);
      await queryClient.invalidateQueries({ queryKey: queryKeys.home });
      await queryClient.invalidateQueries({ queryKey: queryKeys.resumes });
      toast.show(copy.templates.applied(template?.name ?? ''));
      router.dismissAll();
    } finally {
      setApplying(false);
    }
  }, [queryClient, router, template, templateKey, toast]);

  return (
    <FlowScreen testID="screen-template-preview">
      <NavBar title={template?.name ?? ''} />

      <View style={styles.segment}>
        {(
          [
            ['sample', copy.templates.segmentSample],
            ['mine', copy.templates.segmentMine],
          ] as const
        ).map(([value, label]) => {
          const isActive = mode === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              testID={`template-segment-${value}`}
              onPress={() => setMode(value)}
              style={[styles.segmentItem, isActive && styles.segmentItemActive]}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  isActive && styles.segmentLabelActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <GestureDetector gesture={swipe}>
        <View style={styles.paperWrap}>
          <PaperPreview
            content={content}
            templateKey={templateKey}
            testID="template-paper"
          />
        </View>
      </GestureDetector>

      <View style={styles.navRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="上一个模版"
          testID="template-prev"
          onPress={() => step(-1)}
          style={styles.arrow}
        >
          <BackIcon size={15} color={colors.text.muted} />
        </Pressable>

        <View>
          <View style={styles.dots}>
            {RESUME_TEMPLATE_KEYS.map((templateId, i) => (
              <View
                key={templateId}
                style={[styles.dot, i === index && styles.dotActive]}
              />
            ))}
          </View>
          <Text style={styles.swipeHint}>{copy.templates.swipeHint}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="下一个模版"
          testID="template-next"
          onPress={() => step(1)}
          style={styles.arrow}
        >
          <ForwardIcon size={15} color={colors.text.muted} />
        </Pressable>
      </View>

      <PrimaryButton
        label={copy.templates.apply}
        onPress={() => void apply()}
        style={styles.cta}
        testID="template-apply"
      />

      <LoadingOverlay visible={applying} message={copy.templates.applying} />
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.bg.track,
    borderRadius: 11,
    padding: 3,
    width: 210,
    alignSelf: 'center',
    flexShrink: 0,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 9,
    alignItems: 'center',
  },
  segmentItemActive: {
    backgroundColor: colors.bg.card,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1.5,
    elevation: 2,
  },
  segmentLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.muted,
  },
  segmentLabelActive: {
    color: colors.text.primary,
  },

  paperWrap: {
    flex: 1,
  },

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    flexShrink: 0,
  },
  arrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.bg.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.dotIdle,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.primary,
  },
  swipeHint: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.text.tertiary,
    marginTop: 4,
  },

  cta: {
    marginBottom: 24,
  },
});
