import { copy } from '@zhiyou/shared';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FlowScreen } from '../../components/FlowScreen';
import { NavBar } from '../../components/NavBar';
import { RingGauge } from '../../components/RingGauge';
import { ListCard, PrimaryButton, RichText } from '../../components/ui';
import { useOptimizeFlow } from '../../lib/optimizeFlow';
import { colors, spacing } from '../../theme';

/**
 * 匹配度（截图 13）。
 *
 * 返回键回首页而不是回分析页——分析页已经被 replace 掉了，
 * 原型这里也是 goHome()。
 */
export default function MatchScreen() {
  const router = useRouter();
  const flow = useOptimizeFlow();

  const analysis = flow.analysis;
  const missing = analysis?.missing_keywords ?? [];

  return (
    <FlowScreen testID="screen-match">
      <NavBar title={copy.match.title} onBack={() => router.dismissAll()} />

      <RichText
        text={copy.match.jobLine(flow.jobTitle, flow.company)}
        style={styles.jobLine}
        strongStyle={styles.jobLineStrong}
      />

      <View style={styles.gauge}>
        <RingGauge
          percent={analysis?.match_score ?? 0}
          caption={copy.match.gaugeCaption}
          testID="match-gauge"
        />
      </View>

      <RichText
        text={
          missing.length > 0
            ? copy.match.verdict(analysis?.satisfied_count ?? 0, missing.length)
            : copy.match.verdictNoGap(analysis?.satisfied_count ?? 0)
        }
        style={styles.verdict}
        strongStyle={styles.verdictStrong}
        testID="match-verdict"
      />

      {missing.length > 0 ? (
        <ListCard style={styles.missingCard}>
          {missing.map((item, index) => (
            <View
              key={item.keyword}
              style={[styles.missingRow, index > 0 && styles.missingDivider]}
              testID={`missing-${item.keyword}`}
            >
              <View style={styles.plus}>
                <Text style={styles.plusSign}>+</Text>
              </View>
              <Text style={styles.keyword}>{item.keyword}</Text>
              <Text style={styles.keywordCount}>
                {copy.match.keywordCount(item.count)}
              </Text>
            </View>
          ))}
        </ListCard>
      ) : null}

      <PrimaryButton
        label={copy.match.optimize}
        onPress={() => router.push('/optimize/suggestions')}
        style={styles.cta}
        testID="match-optimize"
      />
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  jobLine: {
    textAlign: 'center',
    fontSize: 14,
    color: colors.text.secondary,
  },
  jobLineStrong: {
    color: colors.text.primary,
    fontWeight: '700',
  },

  gauge: {
    alignItems: 'center',
    flexShrink: 0,
  },

  verdict: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 24,
    color: colors.text.ink,
  },
  verdictStrong: {
    color: colors.text.primary,
    fontWeight: '700',
  },

  missingCard: {
    paddingVertical: 6,
  },
  missingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 13,
    paddingHorizontal: spacing.card,
  },
  missingDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider.row,
  },
  plus: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.tint.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusSign: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  keyword: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '600',
    color: colors.text.primary,
  },
  keywordCount: {
    fontSize: 12.5,
    color: colors.text.tertiary,
  },

  cta: {
    marginTop: 'auto',
    marginBottom: 28,
  },
});
