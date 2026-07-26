import React from 'react';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';

import { colors } from '../theme';

/**
 * 匹配度环形图（截图 13）。
 *
 * 数值与原型一致：半径 70、stroke 12、圆头端点、从 12 点方向顺时针，
 * 中央 40pt/800 的百分比 + 下方 12.5pt 的「匹配度」。
 */
export function RingGauge({
  percent,
  caption,
  size = 150,
  testID,
}: {
  percent: number;
  caption: string;
  size?: number;
  testID?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const filled = (circumference * clamped) / 100;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 164 164"
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={`${caption} ${clamped}%`}
    >
      <Circle
        cx={82}
        cy={82}
        r={radius}
        fill="none"
        stroke={colors.bg.stepIdle}
        strokeWidth={12}
      />
      <Circle
        cx={82}
        cy={82}
        r={radius}
        fill="none"
        stroke={colors.primary}
        strokeWidth={12}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
        // 起点转到 12 点方向
        transform="rotate(-90 82 82)"
      />
      <SvgText
        x={82}
        y={82}
        textAnchor="middle"
        fontSize={40}
        fontWeight="800"
        fill={colors.text.primary}
      >
        {`${clamped}%`}
      </SvgText>
      <SvgText
        x={82}
        y={104}
        textAnchor="middle"
        fontSize={12.5}
        fill={colors.text.secondary}
      >
        {caption}
      </SvgText>
    </Svg>
  );
}
