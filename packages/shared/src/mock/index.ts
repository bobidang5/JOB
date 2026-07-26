import type {
  AnalysisResult,
  ResumeContent,
  ResumeTemplateKey,
} from '../schemas.js';

/**
 * 原型 prototype-interactive.html 底部 <script> 常量区的移植。
 *
 * 用途有三：MockAIService 的返回值、离线/CI 下的端到端联调、以及
 * 「模版预览」页的示例内容。数值与文案与原型逐字一致，改动只在
 * 数据结构层面（见 schemas.ts 的说明）。
 */

/* ============================================================
 * 模版（原型 TPLS + 模版库卡片上的文案）
 * ========================================================== */

export interface TemplateMeta {
  key: ResumeTemplateKey;
  name: string;
  /** 模版库顶部筛选胶囊用；「全部」不入库，由前端兜底 */
  categories: string[];
  /** 卡片副标题，如「产品经理 · 12k 人在用」 */
  usageLabel: string;
  isRecommended: boolean;
}

export const MOCK_TEMPLATES: readonly TemplateMeta[] = [
  {
    key: 'v1',
    name: '简洁单栏',
    categories: ['产品'],
    usageLabel: '产品经理 · 12k 人在用',
    isRecommended: true,
  },
  {
    key: 'v2',
    name: '经典双栏',
    categories: ['通用'],
    usageLabel: '通用 · 8.6k 人在用',
    isRecommended: false,
  },
  {
    key: 'v3',
    name: '数据成果型',
    categories: ['产品', '运营'],
    usageLabel: '产品 / 运营 · 5.2k 人在用',
    isRecommended: false,
  },
  {
    key: 'v4',
    name: '应届通用',
    categories: ['校招'],
    usageLabel: '校招 · 9.1k 人在用',
    isRecommended: false,
  },
];

/** 模版库筛选胶囊。「应届生」是展示名，过滤时匹配 categories 里的「校招」。 */
export const TEMPLATE_FILTERS: readonly { label: string; match: string | null }[] =
  [
    { label: '全部', match: null },
    { label: '产品', match: '产品' },
    { label: '运营', match: '运营' },
    { label: '技术', match: '技术' },
    { label: '应届生', match: '校招' },
  ];

/* ============================================================
 * 简历内容
 * ========================================================== */

/** 原型 MINE —— 已优化后的简历，用于「我的简历」与模版预览的「我的内容」。 */
export const MOCK_RESUME_MINE: ResumeContent = {
  name: '李婷',
  meta: '产品经理 · 3 年经验 · 深圳 · liting@mail.com · 138****8888',
  summary: '3 年增长型产品人：擅长用数据实验驱动转化提升',
  exp: [
    {
      co: '美团 · 产品运营专员',
      date: '2023.06 – 至今',
      lis: [
        '主导 2 条核心产品线运营，3 个月内推动 DAU 增长 25%',
        '搭建用户增长 A/B 实验体系，关键转化率提升 12%',
        '沉淀增长打法文档，被 3 个兄弟团队复用',
      ],
    },
    {
      co: '橙心科技 · 产品助理',
      date: '2022.07 – 2023.05',
      lis: [
        '负责需求文档撰写与竞品分析，推动 8 个版本迭代上线',
        '协助搭建用户反馈闭环，工单响应时长缩短 40%',
      ],
    },
  ],
  projects: [
    {
      name: '签到裂变增长项目',
      date: '2024.03 – 2024.08',
      lis: ['独立负责签到裂变项目，新客获客成本降低 32%'],
    },
  ],
  edu: '深圳大学 · 工商管理（本科）',
  eduDate: '2018 – 2022',
  skills: '数据分析 / SQL / A/B 测试 / Axure / 用户调研 / 项目管理',
};

/**
 * 优化前的简历。
 *
 * 原型的 SUGS 是一组与 MINE 脱钩的演示数据——它的 old 文案在 MINE 里
 * 根本不存在，因为 MINE 已经是优化后的样子。真实代码里 field_path 必须
 * 能解析，所以这里补上「之前」的版本：四条建议的 old 各自落在一个
 * 可寻址的位置上，全部采纳后就得到接近 MOCK_RESUME_MINE 的结果。
 */
export const MOCK_RESUME_BEFORE: ResumeContent = {
  name: '李婷',
  meta: '产品经理 · 3 年经验 · 深圳 · liting@mail.com · 138****8888',
  summary: '性格开朗，工作认真负责，抗压能力强',
  exp: [
    {
      co: '美团 · 产品运营专员',
      date: '2023.06 – 至今',
      lis: [
        '负责公司产品的日常运营工作',
        '搭建用户增长 A/B 实验体系，关键转化率提升 12%',
        '沉淀增长打法文档，被 3 个兄弟团队复用',
      ],
    },
    {
      co: '橙心科技 · 产品助理',
      date: '2022.07 – 2023.05',
      lis: [
        '负责需求文档撰写与竞品分析，推动 8 个版本迭代上线',
        '协助搭建用户反馈闭环，工单响应时长缩短 40%',
      ],
    },
  ],
  projects: [
    {
      name: '签到裂变增长项目',
      date: '2024.03 – 2024.08',
      lis: ['参与了用户增长相关项目'],
    },
  ],
  edu: '深圳大学 · 工商管理（本科）',
  eduDate: '2018 – 2022',
  skills: '熟悉常用办公软件与数据工具',
};

/** 原型 SAMPLE —— 模版预览的「示例内容」，新用户无简历时显示。 */
export const MOCK_RESUME_SAMPLE: ResumeContent = {
  name: '王示例',
  meta: '求职意向：产品经理 · 城市 · example@mail.com · 130****0000',
  summary: '这里展示一段自我评价，用一句话说清你的定位与擅长',
  exp: [
    {
      co: '某互联网公司 · 产品经理',
      date: '2022.01 – 至今',
      lis: [
        '这里展示一段工作经历描述，突出动作与量化结果',
        '第二条经历要点，说明项目背景与个人贡献',
      ],
    },
    {
      co: '某科技公司 · 产品助理',
      date: '2020.07 – 2021.12',
      lis: ['示例要点：负责的模块、使用的方法与达成的效果'],
    },
  ],
  projects: [],
  edu: '某大学 · 某专业（本科）',
  eduDate: '2016 – 2020',
  skills: '技能一 / 技能二 / 技能三 / 技能四',
};

/* ============================================================
 * 目标职位与分析结果
 * ========================================================== */

/** 原型 JD_DEMO —— 「粘贴示例 JD」按钮塞进输入框的文本。 */
export const MOCK_JD_TEXT =
  '【产品经理（增长方向）】岗位职责：负责核心产品线的用户增长策略制定与落地，' +
  '搭建 A/B 测试体系，通过数据分析驱动关键转化率提升；与研发、设计协作推进需求' +
  '文档落地，对 DAU 与留存负责。任职要求：3 年以上产品经验；熟练使用 SQL 做数据' +
  '分析；有增长策略实战案例；本科及以上学历。';

export const MOCK_JOB_TARGET = {
  title: '产品经理（增长方向）',
  company: '字节跳动',
} as const;

export const MOCK_BASE_SCORE = 76;
export const MOCK_MAX_SCORE = 84;

/**
 * 原型 SUGS + s-match 页的写死数值。
 *
 * score_delta 一律为 2、max_score 为 84 —— 逐位复现 DESIGN-SPEC §5.3 的
 * 「每采纳 1 条 +2 分，上限 84」。原型 neu 字段里的 <b> 标签在这里拆成
 * suggested_text（纯文本）+ emphasis（需高亮的子串）。
 */
export const MOCK_ANALYSIS: AnalysisResult = {
  match_score: 82,
  satisfied_count: 12,
  missing_keywords: [
    { keyword: 'SQL', count: 4 },
    { keyword: 'A/B 测试', count: 3 },
    { keyword: '增长策略', count: 2 },
  ],
  max_score: MOCK_MAX_SCORE,
  suggestions: [
    {
      tag: '工作经历 · 量化成果',
      original_text: '负责公司产品的日常运营工作',
      suggested_text: '主导 2 条核心产品线运营，3 个月内推动 DAU 增长 25%',
      emphasis: ['25%'],
      rationale: '加入具体数据，更有说服力',
      score_delta: 2,
      field_path: 'exp[0].lis[0]',
    },
    {
      tag: '技能特长 · 补关键词',
      original_text: '熟悉常用办公软件与数据工具',
      suggested_text: '熟练使用 SQL 与 A/B 测试 支撑增长决策',
      emphasis: ['SQL', 'A/B 测试'],
      rationale: '补上 JD 里反复出现的关键词',
      score_delta: 2,
      field_path: 'skills',
    },
    {
      tag: '自我评价 · 去空话',
      original_text: '性格开朗，工作认真负责，抗压能力强',
      suggested_text: '3 年增长型产品人：擅长用数据实验驱动转化提升',
      emphasis: ['数据实验'],
      rationale: '少形容词，多定位与事实',
      score_delta: 2,
      field_path: 'summary',
    },
    {
      tag: '项目经历 · 强动词',
      original_text: '参与了用户增长相关项目',
      suggested_text: '独立负责签到裂变项目，新客获客成本降低 32%',
      emphasis: ['独立负责', '32%'],
      rationale: '「独立负责」+ 结果，比「参与」有力',
      score_delta: 2,
      field_path: 'projects[0].lis[0]',
    },
  ],
};

/* ============================================================
 * 记录（原型 initState 的 records）
 * ========================================================== */

export interface MockRecord {
  title: string;
  subtitle: string;
  scoreBefore: number;
  scoreAfter: number;
}

export const MOCK_RECORDS: readonly MockRecord[] = [
  {
    title: '产品经理-李婷.pdf',
    subtitle: '昨天 · 投向字节跳动',
    scoreBefore: 76,
    scoreAfter: 84,
  },
  {
    title: '运营专员-李婷.pdf',
    subtitle: '7月20日 · 投向美团',
    scoreBefore: 62,
    scoreAfter: 71,
  },
];

/** 原型 s-me 页的资料卡。 */
export const MOCK_PROFILE = {
  full_name: '李婷',
  job_intent: '产品经理',
  years_experience: 3,
  city: '深圳',
  phone: '138****8888',
  email: 'liting@mail.com',
  avatar_url: null,
} as const;
