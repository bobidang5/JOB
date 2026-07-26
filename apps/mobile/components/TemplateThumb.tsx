import type { ResumeTemplateKey } from '@zhiyou/shared';
import React from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';

import { colors } from '../theme';

/**
 * 模版库卡片里的缩略图（截图 08）。
 *
 * 原型是用一堆骨架条手绘出四种版式的轮廓，不是真实渲染——这样缩到
 * 150 高还能一眼看出版式差别。这里逐条移植那些骨架条。
 */

type BarTone = 'line' | 'strong' | 'accent';

function Bar({
  width,
  tone = 'line',
  marginTop = 5,
}: {
  width: DimensionValue;
  tone?: BarTone;
  marginTop?: number;
}) {
  return (
    <View
      style={[
        styles.bar,
        tone === 'strong' && styles.barStrong,
        tone === 'accent' && styles.barAccent,
        { width, marginTop },
      ]}
    />
  );
}

const Gap = ({ height = 6 }: { height?: number }) => <View style={{ height }} />;

export function TemplateThumb({ templateKey }: { templateKey: ResumeTemplateKey }) {
  return <View style={styles.thumb}>{renderVariant(templateKey)}</View>;
}

function renderVariant(templateKey: ResumeTemplateKey) {
  switch (templateKey) {
    case 'v2':
      return (
        <>
          <Bar width="50%" tone="strong" marginTop={0} />
          <View style={styles.row}>
            <View style={styles.leftColumn}>
              <View style={styles.photo} />
              <Bar width="80%" />
              <Bar width="56%" />
              <Bar width="80%" />
              <Bar width="60%" tone="accent" />
            </View>
            <View style={styles.rightColumn}>
              <Bar width="40%" tone="accent" marginTop={0} />
              <Bar width="96%" />
              <Bar width="88%" />
              <Gap height={5} />
              <Bar width="34%" tone="accent" />
              <Bar width="90%" />
              <Bar width="85%" />
            </View>
          </View>
        </>
      );

    case 'v3':
      return (
        <>
          <Bar width="42%" tone="strong" marginTop={0} />
          <Bar width="24%" tone="accent" />
          <View style={styles.chart}>
            {[11, 17, 24, 14].map((height, index) => (
              <View
                key={index}
                style={[
                  styles.chartBar,
                  { height, backgroundColor: CHART_COLORS[index] },
                ]}
              />
            ))}
          </View>
          <Gap />
          <Bar width="32%" tone="strong" />
          <Bar width="92%" />
          <Bar width="86%" />
        </>
      );

    case 'v4':
      return (
        <View style={styles.centered}>
          <Bar width="42%" tone="strong" marginTop={0} />
          <Bar width="26%" tone="accent" />
          <Bar width="68%" marginTop={7} />
          <Gap height={8} />
          <View style={styles.fullWidth}>
            <Bar width="30%" tone="strong" />
            <Bar width="94%" />
            <Bar width="88%" />
            <Gap />
            <Bar width="34%" tone="strong" />
            <Bar width="90%" />
          </View>
        </View>
      );

    case 'v1':
    default:
      return (
        <>
          <Bar width="45%" tone="strong" marginTop={0} />
          <Bar width="28%" tone="accent" />
          <Gap />
          <Bar width="30%" tone="strong" />
          <Bar width="95%" />
          <Bar width="88%" />
          <Bar width="92%" />
          <Gap />
          <Bar width="36%" tone="strong" />
          <Bar width="90%" />
          <Bar width="84%" />
        </>
      );
  }
}

const CHART_COLORS = ['#CFE3FF', '#9CC5FF', '#5EA1FF', '#CFE3FF'];

const styles = StyleSheet.create({
  thumb: {
    backgroundColor: '#FBFBFD',
    borderWidth: 1,
    borderColor: '#EFEFF3',
    borderRadius: 10,
    height: 150,
    paddingVertical: 11,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  bar: {
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.skeleton.line,
  },
  barStrong: {
    height: 6,
    backgroundColor: colors.skeleton.strong,
  },
  barAccent: {
    backgroundColor: colors.skeleton.accent,
  },

  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  leftColumn: {
    width: '34%',
    backgroundColor: colors.skeleton.panel,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  rightColumn: {
    flex: 1,
    minWidth: 0,
  },
  photo: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.skeleton.dot,
    marginBottom: 4,
  },

  chart: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'flex-end',
    height: 26,
    marginTop: 8,
  },
  chartBar: {
    width: 12,
    borderRadius: 3,
  },

  centered: {
    alignItems: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
});
