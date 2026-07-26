import { copy, splitEmphasis } from '@zhiyou/shared';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FlowScreen } from '../../components/FlowScreen';
import { NavAction, NavBar } from '../../components/NavBar';
import { ProgressBar } from '../../components/ProgressBar';
import { ArrowDownIcon } from '../../components/icons';
import { Badge, Card, GhostButton, PrimaryButton } from '../../components/ui';
import { useOptimizeFlow } from '../../lib/optimizeFlow';
import { colors, radius, spacing } from '../../theme';

/**
 * 优化建议（截图 14）—— 一次一条：分类标签、原文（灰底）→ 建议改为
 * （蓝底，关键词主色高亮）、一句理由；顶部是 n/4 与进度条。
 *
 * 最后一条决定完后进完成页。
 */
export default function SuggestionsScreen() {
  const router = useRouter();
  const flow = useOptimizeFlow();

  const suggestion = flow.currentSuggestion;
  const total = flow.totalSuggestions;
  const index = flow.currentIndex;

  // 切到下一条时从右侧滑入（原型 @keyframes sugin）
  const enter = useState(() => new Animated.Value(1))[0];
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  const decide = useCallback(
    (adopt: boolean) => {
      const hasNext = flow.decide(adopt);
      if (!hasNext) router.replace('/optimize/done');
    },
    [flow, router],
  );

  if (!suggestion) {
    // 没有建议可看（分析未完成或直接进入本页），退回上一屏
    return (
      <FlowScreen testID="screen-suggestions">
        <NavBar title={copy.suggestions.title} />
      </FlowScreen>
    );
  }

  const segments = splitEmphasis(suggestion.suggested_text, suggestion.emphasis);

  return (
    <FlowScreen testID="screen-suggestions" gap={14}>
      <NavBar
        title={copy.suggestions.title}
        right={
          <NavAction
            label={copy.suggestions.progress(index + 1, total)}
            tone="muted"
            testID="suggestion-progress-label"
          />
        }
      />

      <ProgressBar progress={(index + 1) / total} testID="suggestion-progress" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: enter,
            transform: [
              {
                translateX: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [46, 0],
                }),
              },
            ],
          }}
        >
          <Card style={styles.card} testID="suggestion-card">
            <View style={styles.tagRow}>
              <Badge label={suggestion.tag} style={styles.tag} />
            </View>

            <Text style={styles.label}>{copy.suggestions.labelOld}</Text>
            <Text style={styles.oldBlock} testID="suggestion-old">
              {suggestion.original_text}
            </Text>

            <View style={styles.arrowRow}>
              <View style={styles.arrowCircle}>
                <ArrowDownIcon size={14} />
              </View>
            </View>

            <Text style={[styles.label, styles.labelBlue]}>
              {copy.suggestions.labelNew}
            </Text>
            <Text style={styles.newBlock} testID="suggestion-new">
              {segments.map((segment, i) => (
                <Text key={i} style={segment.highlighted ? styles.highlight : undefined}>
                  {segment.text}
                </Text>
              ))}
            </Text>

            <Text style={styles.why}>{suggestion.rationale}</Text>
          </Card>
        </Animated.View>
      </ScrollView>

      <View style={styles.actions}>
        <PrimaryButton
          label={copy.suggestions.adopt}
          onPress={() => decide(true)}
          testID="suggestion-adopt"
        />
        <GhostButton
          label={copy.suggestions.skip}
          onPress={() => decide(false)}
          testID="suggestion-skip"
        />
      </View>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
  },
  card: {
    paddingVertical: 20,
    paddingHorizontal: spacing.card,
  },

  tagRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  tag: {
    fontSize: 11.5,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.tertiary,
    letterSpacing: 1,
    marginBottom: 7,
  },
  labelBlue: {
    color: colors.primary,
  },

  oldBlock: {
    fontSize: 15,
    lineHeight: 25.5,
    color: colors.text.secondary,
    backgroundColor: colors.bg.subtle,
    borderRadius: radius.input,
    paddingVertical: 13,
    paddingHorizontal: 15,
    overflow: 'hidden',
  },

  arrowRow: {
    alignItems: 'center',
    marginVertical: 12,
  },
  arrowCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
  },

  newBlock: {
    fontSize: 15,
    lineHeight: 25.5,
    fontWeight: '600',
    color: colors.text.primary,
    backgroundColor: colors.tint.soft,
    borderRadius: radius.input,
    paddingVertical: 13,
    paddingHorizontal: 15,
    overflow: 'hidden',
  },
  highlight: {
    color: colors.primary,
  },

  why: {
    fontSize: 12.5,
    color: colors.text.tertiary,
    marginTop: 12,
    textAlign: 'center',
  },

  actions: {
    marginTop: 'auto',
    marginBottom: 24,
  },
});
