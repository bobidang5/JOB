import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '../theme';

/**
 * 图标 —— 逐条移植自 prototype-interactive.html 顶部的 <symbol> 定义，
 * viewBox 与路径数据原样保留，确保线宽与视觉重量和原型一致。
 */

export interface IconProps {
  size?: number;
  color?: string;
}

const DEFAULT_SIZE = 24;

type SvgWrapperProps = IconProps & { children: React.ReactNode };

function Icon({ size = DEFAULT_SIZE, children }: SvgWrapperProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {children}
    </Svg>
  );
}

/* ---------------- Dock ---------------- */

export function HomeIcon({ size, color = colors.text.muted }: IconProps) {
  return (
    <Icon size={size}>
      <Path
        d="M4.5 10.8 12 4.4l7.5 6.4v8a1.3 1.3 0 0 1-1.3 1.3h-4.1v-5.5H9.9v5.5H5.8a1.3 1.3 0 0 1-1.3-1.3z"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

export function ClockIcon({ size, color = colors.text.muted }: IconProps) {
  return (
    <Icon size={size}>
      <Circle cx={12} cy={12} r={8.2} fill="none" stroke={color} strokeWidth={1.8} />
      <Path
        d="M12 7.8V12l3 1.9"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

export function UserIcon({ size, color = colors.text.muted }: IconProps) {
  return (
    <Icon size={size}>
      <Circle cx={12} cy={8.1} r={3.4} fill="none" stroke={color} strokeWidth={1.8} />
      <Path
        d="M5.2 19.6c.6-3.3 3.3-5 6.8-5s6.2 1.7 6.8 5"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Icon>
  );
}

/** Dock 右侧的 AI 圆钮，以及分析页中央的图标 */
export function SparkIcon({ size, color = colors.primary }: IconProps) {
  return (
    <Icon size={size}>
      <Path
        d="M11.2 4.6 12.7 8.8l4.2 1.5-4.2 1.5-1.5 4.2-1.5-4.2-4.2-1.5 4.2-1.5z"
        fill="none"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Path
        d="M18.3 14.7l.65 1.85 1.85.65-1.85.65-.65 1.85-.65-1.85-1.85-.65 1.85-.65z"
        fill={color}
      />
    </Icon>
  );
}

/* ---------------- 列表与操作 ---------------- */

export function DocIcon({ size, color = colors.primary }: IconProps) {
  return (
    <Icon size={size}>
      <Rect
        x={5.5}
        y={3.8}
        width={13}
        height={16.6}
        rx={2.4}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
      />
      <Path
        d="M9 9.3h6M9 12.8h6M9 16.3h3.6"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Icon>
  );
}

export function PlusIcon({ size, color = colors.primary }: IconProps) {
  return (
    <Icon size={size}>
      <Path
        d="M12 5.2v13.6M5.2 12h13.6"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Icon>
  );
}

export function GridIcon({ size, color = colors.primary }: IconProps) {
  const rects = [
    { x: 4, y: 4 },
    { x: 13, y: 4 },
    { x: 4, y: 13 },
    { x: 13, y: 13 },
  ];
  return (
    <Icon size={size}>
      {rects.map((r) => (
        <Rect
          key={`${r.x}-${r.y}`}
          x={r.x}
          y={r.y}
          width={7}
          height={7}
          rx={1.8}
          fill="none"
          stroke={color}
          strokeWidth={1.7}
        />
      ))}
    </Icon>
  );
}

export function UploadIcon({ size, color = colors.primary }: IconProps) {
  return (
    <Icon size={size}>
      <Path
        d="M12 14.6V4.8M8.2 8.4 12 4.6l3.8 3.8"
        fill="none"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 15.6v2.6A1.8 1.8 0 0 0 6.8 20h10.4a1.8 1.8 0 0 0 1.8-1.8v-2.6"
        fill="none"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Icon>
  );
}

export function BriefcaseIcon({ size, color = colors.primary }: IconProps) {
  return (
    <Icon size={size}>
      <Rect
        x={3.6}
        y={8}
        width={16.8}
        height={12}
        rx={2.6}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
      />
      <Path
        d="M9 8V6.3a1.8 1.8 0 0 1 1.8-1.8h2.4A1.8 1.8 0 0 1 15 6.3V8M3.6 13h16.8"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Icon>
  );
}

export function SettingsIcon({
  size,
  color = colors.primary,
  knobFill = colors.bg.card,
}: IconProps & { knobFill?: string }) {
  return (
    <Icon size={size}>
      <Path
        d="M4.5 8h15M4.5 16h15"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Circle cx={9.5} cy={8} r={2.5} fill={knobFill} stroke={color} strokeWidth={1.8} />
      <Circle cx={14.5} cy={16} r={2.5} fill={knobFill} stroke={color} strokeWidth={1.8} />
    </Icon>
  );
}

export function CameraIcon({ size, color = '#FFFFFF' }: IconProps) {
  return (
    <Icon size={size}>
      <Path
        d="M4.5 8.4a2.2 2.2 0 0 1 2.2-2.2h1.5l1.3-1.9h5l1.3 1.9h1.5a2.2 2.2 0 0 1 2.2 2.2v7.9a2.2 2.2 0 0 1-2.2 2.2H6.7a2.2 2.2 0 0 1-2.2-2.2z"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12.2} r={3.3} fill="none" stroke={color} strokeWidth={1.8} />
    </Icon>
  );
}

/* ---------------- 方向与状态 ---------------- */

export function BackIcon({ size, color = colors.text.primary }: IconProps) {
  return (
    <Icon size={size}>
      <Path
        d="M14.6 5.4 8 12l6.6 6.6"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

export function ForwardIcon({ size, color = colors.text.primary }: IconProps) {
  return (
    <Icon size={size}>
      <Path
        d="M9.4 5.4 16 12l-6.6 6.6"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

/** 列表行右侧的 chevron，比 ForwardIcon 细一点 */
export function ChevronIcon({ size = 20, color = colors.text.quaternary }: IconProps) {
  return (
    <Icon size={size}>
      <Path
        d="M9.5 5.5 16 12l-6.5 6.5"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

/** 优化建议卡中间的向下箭头 */
export function ArrowDownIcon({ size, color = colors.primary }: IconProps) {
  return (
    <Icon size={size}>
      <Path
        d="M12 5v13M6.8 12.8 12 18l5.2-5.2"
        fill="none"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}

export function CheckIcon({ size, color = '#FFFFFF' }: IconProps) {
  return (
    <Icon size={size}>
      <Path
        d="M4.8 12.6l4.3 4.3L19.2 6.8"
        fill="none"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Icon>
  );
}
