import type { CSSProperties } from 'react';

/**
 * 后台共用的几段内联样式。
 *
 * 刻意不引 Tailwind 或任何 UI 框架：这是个内部后台，总共几个页面，
 * 依赖越少越好（构建更快，也不用为它维护一套配置）。配色跟着落地页
 * app/page.tsx 走，保持克制。
 */

export const CARD: CSSProperties = {
  background: '#FFFFFF',
  borderRadius: 20,
  padding: 28,
  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)',
};

export const LABEL: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#3A3A3C',
  marginBottom: 6,
};

export const INPUT: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  fontSize: 15,
  color: '#111114',
  background: '#FFFFFF',
  border: '1px solid #E5E5EA',
  borderRadius: 12,
  outline: 'none',
  fontFamily: 'inherit',
};

export const PRIMARY_BUTTON: CSSProperties = {
  width: '100%',
  padding: '14px 20px',
  fontSize: 16,
  fontWeight: 700,
  color: '#FFFFFF',
  background: '#007AFF',
  border: 'none',
  borderRadius: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export const BUTTON_BUSY: CSSProperties = {
  ...PRIMARY_BUTTON,
  background: '#B4D7FF',
  cursor: 'progress',
};

export const ERROR_BOX: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  color: '#C0392B',
  background: '#FFF1F0',
  border: '1px solid #FFD5D0',
  borderRadius: 10,
  padding: '10px 12px',
};

export const SUCCESS_BOX: CSSProperties = {
  ...ERROR_BOX,
  color: '#1F7A3D',
  background: '#EFFAF2',
  border: '1px solid #C9EAD5',
};

export const HINT: CSSProperties = {
  fontSize: 12,
  color: '#8E8E93',
  lineHeight: 1.7,
};
