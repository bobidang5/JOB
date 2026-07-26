/**
 * 设计 Token —— DESIGN-SPEC §3 的全量落地。
 *
 * 组件一律引用这里的值，不写字面量。数值全部来自
 * prototype-interactive.html 的样式块，改主题只动这一个文件。
 */

export const colors = {
  /** 唯一主色：主按钮、选中态、链接、进度、匹配环 */
  primary: '#007AFF',

  success: '#34C759',
  /** 分数增量、记录 delta 的文字色 */
  successText: '#1F9D55',
  /** JD 过短的描边与提示文字 */
  error: '#FF3B30',

  text: {
    primary: '#111114',
    secondary: '#8E8E93',
    tertiary: '#AEAEB2',
    /** chevron 与最弱的提示 */
    quaternary: '#C7C7CC',
    /** Dock 未选中 Tab、筛选胶囊、模版预览箭头 */
    muted: '#6E6E76',
    /** 正文次级（简历纸要点） */
    ink: '#48484A',
    placeholder: '#B8B8BE',
    /** 分析页未完成的步骤 */
    pending: '#C0C0C6',
  },

  bg: {
    screen: '#F7F7FA',
    card: '#FFFFFF',
    /** 原文块 */
    subtle: '#F5F5F7',
    /** 分段控件底、进度条轨道 */
    track: '#E9E9EE',
    /** 分析页未完成步骤的圆点 */
    stepIdle: '#ECECF1',
  },

  divider: {
    /** 列表行之间 */
    row: '#F0F0F3',
    /** 卡片与简历纸描边 */
    hairline: '#ECECF1',
  },

  tint: {
    /** 图标圆底、标签底 */
    faint: 'rgba(0,122,255,0.09)',
    /** 建议「改为」块的底色 */
    soft: 'rgba(0,122,255,0.07)',
    /** Dock 选中 Tab 的透镜高亮 */
    lens: 'rgba(0,122,255,0.14)',
    /** 首页与一级页底部的蓝色辉光 */
    glow: 'rgba(0,122,255,0.17)',
    successSoft: 'rgba(52,199,89,0.13)',
  },

  avatar: {
    bg: '#E4EEFF',
    text: '#2F6BFF',
  },

  toast: 'rgba(17,17,20,0.92)',

  glass: {
    /** Dock 的玻璃底色（叠在 BlurView 之上） */
    fill: 'rgba(252,253,255,0.50)',
    border: 'rgba(255,255,255,0.85)',
    /** 顶部内高光 */
    highlight: 'rgba(255,255,255,0.95)',
  },

  /** 模版缩略图里的骨架条 */
  skeleton: {
    line: '#E9E9EE',
    strong: '#C6C6CE',
    accent: '#9CC5FF',
    panel: '#F1F1F5',
    dot: '#D9D9E0',
  },

  dotIdle: '#D6D6DC',
} as const;

export const typography = {
  /** 一级页大标题：首页「你好，李婷」/「记录」/「我的」 */
  bigTitle: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  bigTitleSub: { fontSize: 14 },
  /** 完成页「优化完成」 */
  doneTitle: { fontSize: 24, fontWeight: '800' },
  /** 导航栏居中标题 */
  navTitle: { fontSize: 17, fontWeight: '700' },
  /** 主按钮文字 */
  button: { fontSize: 16, fontWeight: '700' },
  /** 列表行标题 */
  rowTitle: { fontSize: 16, fontWeight: '600' },
  /** 选择卡标题（新建简历页） */
  choiceTitle: { fontSize: 17, fontWeight: '700' },
  /** 正文——优化建议的原文与建议 */
  body: { fontSize: 15, lineHeight: 25.5 },
  helper: { fontSize: 14 },
  helperSmall: { fontSize: 13 },
  /** 列表行副标题 */
  rowSub: { fontSize: 12.5 },
  /** 徽标、弱提示 */
  hint: { fontSize: 11 },
  /** 分数大数字：首页 76、完成页 84 */
  scoreBig: { fontSize: 56, fontWeight: '800', letterSpacing: -2 },
  /** 完成页左侧的旧分数 */
  scoreOld: { fontSize: 32, fontWeight: '700' },
} as const;

export const radius = {
  card: 20,
  button: 16,
  /** 输入卡与简历纸 */
  input: 14,
  small: 12,
  pill: 999,
} as const;

export const spacing = {
  /** 屏幕左右边距 */
  screenX: 22,
  /** 卡片内边距 */
  card: 18,
  /** 一级页模块间距 */
  gap: 16,
  /** 流程页模块间距 */
  flowGap: 12,
  /** 列表行上下内边距（行高约 66） */
  rowY: 15,
} as const;

export const dock = {
  /** 左右 inset */
  inset: 16,
  /** 距底部 */
  bottom: 22,
  /** 胶囊 Tab 栏高度 */
  pillHeight: 66,
  /** 单个 Tab 的高度（胶囊内） */
  tabHeight: 52,
  /** 右侧独立 AI 圆钮直径 */
  circleSize: 58,
  gap: 12,
  /** BlurView 强度。iOS 上对应 UIVisualEffectView，
   *  原型是 blur(22px) saturate(190%)，这里取视觉等价值。 */
  blurIntensity: 60,
  /** 内容需要能从玻璃下方穿过，所以滚动区底部要留出这么多空白 */
  contentInset: 110,
} as const;

export const shadows = {
  glass: {
    shadowColor: '#11111A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 12,
  },
  card: {
    shadowColor: '#11111A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 11,
    elevation: 3,
  },
  sheet: {
    shadowColor: '#11111A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 15,
    elevation: 10,
  },
} as const;

/** DESIGN-SPEC §5 里出现的时长，集中在这里方便对齐动效节奏。 */
export const timings = {
  /** iOS push/pop 转场 */
  transition: 340,
  /** Toast 停留 */
  toast: 1700,
  /** 分析页三步打勾的时间轴 */
  analyzeSteps: [700, 1500, 2200] as const,
  /** 分析页最短停留：接口更快也要等动画走完 */
  analyzeMinimum: 2800,
  /** 套用模版的遮罩 */
  applyTemplate: 1400,
  /** 头像上传的遮罩 */
  avatarUpload: 900,
  /** JD 过短的抖动 */
  shake: 400,
} as const;

export const theme = {
  colors,
  typography,
  radius,
  spacing,
  dock,
  shadows,
  timings,
} as const;

export type Theme = typeof theme;
