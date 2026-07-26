import { z } from 'zod';

/* ============================================================
 * 简历内容
 *
 * 结构对应原型 <script> 常量区的 MINE / SAMPLE，并补齐两个原型
 * 数据里没有、但 SUGS 建议引用到的段落（自我评价 summary、项目
 * 经历 projects）——否则那两类建议的 field_path 无处落地。
 * ========================================================== */

export const RESUME_TEMPLATE_KEYS = ['v1', 'v2', 'v3', 'v4'] as const;
export const ResumeTemplateKeySchema = z.enum(RESUME_TEMPLATE_KEYS);
export type ResumeTemplateKey = z.infer<typeof ResumeTemplateKeySchema>;

export const ExperienceSchema = z.object({
  /** 「美团 · 产品运营专员」 */
  co: z.string(),
  /** 「2023.06 – 至今」 */
  date: z.string(),
  /** 每条一个要点，渲染为「· xxx」 */
  lis: z.array(z.string()),
});
export type Experience = z.infer<typeof ExperienceSchema>;

export const ProjectSchema = z.object({
  name: z.string(),
  date: z.string(),
  lis: z.array(z.string()),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ResumeContentSchema = z.object({
  name: z.string(),
  /** 一行式基本信息，由 profile 字段拼装：「产品经理 · 3 年经验 · 深圳 · a@b.com」 */
  meta: z.string(),
  /** 自我评价。可为空字符串——空则简历纸不渲染该段。 */
  summary: z.string(),
  exp: z.array(ExperienceSchema),
  projects: z.array(ProjectSchema),
  edu: z.string(),
  eduDate: z.string(),
  /** 「数据分析 / SQL / A/B 测试」——斜杠分隔的一行 */
  skills: z.string(),
});
export type ResumeContent = z.infer<typeof ResumeContentSchema>;

/* ============================================================
 * field_path —— 建议要改写简历的哪个位置
 *
 * 这个值由 LLM 产出，随后被用来写入用户数据，所以必须严格白名单
 * 校验，绝不做动态属性写入。支持的形式只有下面四种。
 * ========================================================== */

const FIELD_PATH_PATTERNS = [
  /^summary$/,
  /^skills$/,
  /^exp\[\d+\]\.lis\[\d+\]$/,
  /^projects\[\d+\]\.lis\[\d+\]$/,
] as const;

export const FieldPathSchema = z
  .string()
  .refine((v) => FIELD_PATH_PATTERNS.some((re) => re.test(v)), {
    message:
      'field_path 必须是 summary、skills、exp[i].lis[j] 或 projects[i].lis[j] 之一',
  });

/* ============================================================
 * 分析结果与优化建议
 * ========================================================== */

export const MissingKeywordSchema = z.object({
  keyword: z.string(),
  /** 该关键词在 JD 中出现的次数，界面显示为「职位中出现 4 次」 */
  count: z.number().int().nonnegative(),
});
export type MissingKeyword = z.infer<typeof MissingKeywordSchema>;

export const SuggestionSchema = z.object({
  /** 分类标签，如「工作经历 · 量化成果」 */
  tag: z.string(),
  /** 简历中的原文 */
  original_text: z.string(),
  /**
   * 建议改为的文案。**纯文本，不含任何标记。**
   * 原型里这里是带 <b> 的 HTML 串；RN 无法 innerHTML，且把展示标记
   * 混进数据会导致写回简历时污染内容。改用下面的 emphasis 表达强调。
   */
  suggested_text: z.string(),
  /** suggested_text 中需要用主色高亮的子串，如 ['25%']。渲染时按出现顺序匹配。 */
  emphasis: z.array(z.string()),
  /** 一句话理由，如「加入具体数据，更有说服力」 */
  rationale: z.string(),
  /** 采纳这条能加多少分 */
  score_delta: z.number().int().nonnegative(),
  field_path: FieldPathSchema,
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

/** LLM 直接产出的结构。分析页与建议页的全部数据来自这一次调用。 */
export const AnalysisResultSchema = z.object({
  /** 匹配度百分比 0–100，界面中央环形图 */
  match_score: z.number().int().min(0).max(100),
  /** 「已满足 12 项职位要求」 */
  satisfied_count: z.number().int().nonnegative(),
  missing_keywords: z.array(MissingKeywordSchema),
  /** 采纳全部建议后简历分的上限 */
  max_score: z.number().int().min(0).max(100),
  suggestions: z.array(SuggestionSchema),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

/**
 * 模型一次调用的完整产出：除了分析结果，还从 JD 里抽出职位名与公司名，
 * 用于匹配度页的「产品经理（增长方向）· 字节跳动」和记录里的「投向 XX」。
 */
export const AnalyzeResponseSchema = AnalysisResultSchema.extend({
  job_title: z.string(),
  /** JD 里没写公司就是空字符串，界面会自动省略「· 公司」那一段 */
  company: z.string(),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

/* ============================================================
 * 请求 / 响应契约
 * ========================================================== */

/** DESIGN-SPEC §5.1：JD 去除首尾空格后不足 50 字则拒绝分析。 */
export const MIN_JD_LENGTH = 50;

export const CreateAnalysisRequestSchema = z.object({
  resume_id: z.string().uuid(),
  jd_text: z.string().transform((s) => s.trim()),
});
export type CreateAnalysisRequest = z.infer<typeof CreateAnalysisRequestSchema>;

export const ApplySuggestionsRequestSchema = z.object({
  /** 用户点了「采纳这条建议」的 suggestion id 集合，顺序无关 */
  adopted_suggestion_ids: z.array(z.string().uuid()),
});
export type ApplySuggestionsRequest = z.infer<
  typeof ApplySuggestionsRequestSchema
>;

export const ApplySuggestionsResponseSchema = z.object({
  score_before: z.number().int(),
  score_after: z.number().int(),
  adopted_count: z.number().int().nonnegative(),
  resume_id: z.string().uuid(),
  resume_version_id: z.string().uuid(),
  optimization_id: z.string().uuid(),
});
export type ApplySuggestionsResponse = z.infer<
  typeof ApplySuggestionsResponseSchema
>;

export const ParseResumeResponseSchema = z.object({
  content: ResumeContentSchema,
  /** 解析出的建议文件名，如「产品经理-李婷.pdf」 */
  title: z.string(),
});
export type ParseResumeResponse = z.infer<typeof ParseResumeResponseSchema>;

/** 个人资料，用于拼装简历基本信息栏（DESIGN-SPEC 截图 05）。 */
export const ProfileSchema = z.object({
  full_name: z.string(),
  job_intent: z.string(),
  years_experience: z.number().int().nonnegative().nullable(),
  city: z.string(),
  phone: z.string(),
  email: z.string(),
  avatar_url: z.string().nullable(),
});
export type Profile = z.infer<typeof ProfileSchema>;
