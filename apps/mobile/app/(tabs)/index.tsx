import { copy, scoreHint } from '@zhiyou/shared';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenView } from '../../components/ScreenView';
import { DocIcon, GridIcon, PlusIcon , ChevronIcon } from '../../components/icons';
import {
  BigTitle,
  Card,
  GhostButton,
  IconCircle,
  ListCard,
  ListRow,
  PrimaryButton,
  Tappable,
} from '../../components/ui';
import { formatRecordSubtitle } from '../../lib/format';
import { useHomeSnapshot } from '../../lib/queries';
import { useStartOptimize } from '../../lib/useStartOptimize';
import { colors, radius, spacing, typography } from '../../theme';

/**
 * 首页（截图 01 老用户 / 截图 02 新用户空状态）。
 *
 * 两种状态的差异（DESIGN-SPEC §5.6）：新用户隐藏分数卡与「开始 AI 优化」，
 * 改为显示引导卡，副标题也换一句。
 */
export default function HomeScreen() {
  const router = useRouter();
  const { data } = useHomeSnapshot();
  const startOptimize = useStartOptimize();

  const resume = data?.defaultResume ?? null;
  const hasResume = !!resume;
  const records = data?.recentRecords ?? [];
  const name = data?.profile.full_name ?? '';

  return (
    <ScreenView testID="screen-home">
      <BigTitle
        title={copy.home.greeting(name)}
        subtitle={
          hasResume ? copy.home.subtitleWithResume : copy.home.subtitleEmpty
        }
      />

      {hasResume ? (
        <>
          <ScoreCard
            score={resume.score}
            onPress={() => router.push(`/resume/${resume.id}`)}
          />

          <ListCard>
            <ListRow
              first
              icon={<PlusIcon size={20} />}
              title={copy.home.newResume}
              subtitle={copy.home.newResumeSub}
              onPress={() => router.push('/resume/new')}
              testID="home-new-resume"
            />
            <ListRow
              icon={<DocIcon size={20} />}
              title={copy.home.pasteJd}
              subtitle={copy.home.pasteJdSub}
              onPress={() => router.push('/optimize/jd')}
              testID="home-paste-jd"
            />
          </ListCard>
        </>
      ) : (
        <EmptyHero
          onFromTemplate={() => router.push('/resume/templates')}
          onUpload={() => router.push('/resume/new')}
        />
      )}

      {hasResume ? (
        <PrimaryButton
          label={copy.home.startOptimize}
          onPress={startOptimize}
          style={styles.cta}
          testID="home-start-optimize"
        />
      ) : null}

      {records.length > 0 ? (
        <ListCard testID="home-recent-records">
          <Text style={styles.peekHeading}>{copy.home.recentRecords}</Text>
          {records.map((record, index) => (
            <ListRow
              key={record.id}
              first={index === 0}
              compact
              showChevron={false}
              icon={<DocIcon size={20} />}
              title={record.resumeTitle}
              subtitle={formatRecordSubtitle(record.createdAt, record.company)}
              right={
                <Text style={styles.delta}>
                  {copy.records.delta(record.scoreBefore, record.scoreAfter)}
                </Text>
              }
              onPress={() => router.push(`/resume/${record.resumeId}`)}
            />
          ))}
        </ListCard>
      ) : null}
    </ScreenView>
  );
}

/* ------------------------------------------------------------------ */

function ScoreCard({ score, onPress }: { score: number; onPress: () => void }) {
  const hint = scoreHint(score);

  return (
    <Tappable
      accessibilityRole="button"
      testID="home-score-card"
      onPress={onPress}
      scaleOnPress={false}
    >
      <Card padded={false} style={styles.scoreCard}>
        <View style={styles.scoreNumber}>
          <Text style={styles.scoreValue}>{score}</Text>
          <Text style={styles.scoreDenominator}>{copy.home.scoreDenominator}</Text>
        </View>
        <View style={styles.scoreInfo}>
          <Text style={styles.scoreLabel}>{copy.home.scoreLabel}</Text>
          <Text style={styles.scoreHint}>
            {hint.kind === 'fresh'
              ? copy.home.scoreHintFresh
              : copy.home.scoreHintImprovable(hint.count)}
          </Text>
        </View>
        <ChevronIcon />
      </Card>
    </Tappable>
  );
}

function EmptyHero({
  onFromTemplate,
  onUpload,
}: {
  onFromTemplate: () => void;
  onUpload: () => void;
}) {
  return (
    <Card padded={false} style={styles.hero} testID="home-empty-hero">
      <IconCircle size={64}>
        <GridIcon size={30} />
      </IconCircle>
      <Text style={styles.heroTitle}>{copy.home.emptyTitle}</Text>
      <Text style={styles.heroBody}>{copy.home.emptyBody}</Text>
      <PrimaryButton
        label={copy.home.emptyPrimary}
        onPress={onFromTemplate}
        style={styles.heroButton}
        testID="home-empty-from-template"
      />
      <GhostButton label={copy.home.emptySecondary} onPress={onUpload} />
    </Card>
  );
}

const styles = StyleSheet.create({
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 20,
    paddingHorizontal: spacing.card,
  },
  scoreNumber: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  scoreValue: {
    fontSize: typography.scoreBig.fontSize,
    fontWeight: typography.scoreBig.fontWeight,
    letterSpacing: typography.scoreBig.letterSpacing,
    lineHeight: typography.scoreBig.fontSize,
    color: colors.text.primary,
  },
  scoreDenominator: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
  scoreInfo: {
    flex: 1,
    paddingLeft: 14,
  },
  scoreLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  scoreHint: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 4,
  },

  hero: {
    paddingVertical: 30,
    paddingHorizontal: spacing.screenX,
    alignItems: 'center',
    borderRadius: radius.card,
  },
  heroTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.text.primary,
    marginTop: 14,
  },
  heroBody: {
    fontSize: 13,
    lineHeight: 21,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 18,
  },
  heroButton: {
    alignSelf: 'stretch',
  },

  // 原型 #homeCTA 的 margin-top:auto —— 把主按钮顶到「最近记录」之上
  cta: {
    marginTop: 'auto',
  },

  peekHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.secondary,
    paddingTop: 10,
    paddingHorizontal: spacing.card,
  },
  delta: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.successText,
  },
});
