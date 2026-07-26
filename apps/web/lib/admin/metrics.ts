import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../database.types';
import { adminDb } from './db';

/**
 * 看板指标聚合。
 *
 * 这里是后台首页所有数字的唯一来源，走 service_role（理由见 db.ts）——
 * 它要跨全体用户汇总，按定义越过 RLS。页面是 Server Component，直接调
 * loadDashboardMetrics()，不绕自己的 HTTP 接口；/api/admin/metrics 存在是
 * 为了让外部（监控、周报脚本）也能拉同一份数据，两边共用这一个函数，
 * 不会出现「页面和接口对不上」。
 *
 * ── 关于除零 ───────────────────────────────────────────────────────
 * 新装的库里一条数据都没有，而成功率、平均提升、P50/P95 全是除法或取样。
 * JS 的 0/0 是 NaN、Math.max() 是 -Infinity，它们会一路渗到页面上变成
 * 「NaN%」这种既不像空也不像错的东西。所以本文件的规矩是：
 *   比率、合计    没有样本时给 0；
 *   均值、分位数  没有样本时给 null（0 分的平均提升和「没有数据」是两回事，
 *                 不能混为一谈，页面据此显示 --）。
 * 末尾那次 Schema.parse() 是最后一道闸：Zod 4 的 z.number() 连 NaN 和
 * Infinity 一起拒，任何漏网的除零都会在这里当场抛出来，而不是印到页面上。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 趋势图的天数。与 admin_signup_trend 的入参保持一致，两张图横轴才对得齐。 */
export const TREND_DAYS = 30;

/**
 * 明细查询的行数上限。
 *
 * 去重活跃用户、token 合计、延迟分位数这些 PostgREST 都聚合不了，只能把行
 * 拉回来自己算。不封顶的话，用量涨上去之后打开一次首页就要把整张 ai_usage
 * 读进内存。所以取最近的这些行，超了就在 sample.truncated 上标出来——
 * 页面会说明「明细基于最近 N 条」，而不是悄悄少算。
 */
export const DETAIL_ROW_CAP = 20000;

/* ------------------------------------------------------------------ *
 * 返回契约
 * ------------------------------------------------------------------ */

export const UserMetricsSchema = z.object({
  total: z.number(),
  newToday: z.number(),
  new7d: z.number(),
  new30d: z.number(),
  confirmed: z.number(),
  /** 已验证邮箱占比，0..1。没有用户时是 0 */
  confirmedRate: z.number(),
});

export const TrendPointSchema = z.object({
  /** UTC 日期，YYYY-MM-DD */
  day: z.string(),
  value: z.number(),
});

export const ActiveUserMetricsSchema = z.object({
  dau: z.number(),
  wau: z.number(),
  mau: z.number(),
});

export const ContentMetricsSchema = z.object({
  resumes: z.number(),
  jobTargets: z.number(),
  analyses: z.number(),
  optimizations: z.number(),
});

/** 明细指标的取样情况：算了多少行、是不是被上限截断了 */
export const SampleSchema = z.object({
  size: z.number(),
  truncated: z.boolean(),
});

export const OptimizationMetricsSchema = z.object({
  sample: SampleSchema,
  /** 平均 score_after - score_before，没有优化记录时 null */
  averageGain: z.number().nullable(),
  totalGain: z.number(),
  averageScoreBefore: z.number().nullable(),
  averageScoreAfter: z.number().nullable(),
});

export const UsageMetricsSchema = z.object({
  /** 全量条数，走 count 拿，不受 DETAIL_ROW_CAP 影响 */
  total: z.number(),
  sample: SampleSchema,
  byKind: z.object({
    parse: z.number(),
    analyze: z.number(),
    draft: z.number(),
  }),
  byStatus: z.object({
    ok: z.number(),
    refusal: z.number(),
    contract: z.number(),
    error: z.number(),
  }),
  /** 各 status 占比，0..1。没有调用时四项全是 0 */
  rates: z.object({
    ok: z.number(),
    refusal: z.number(),
    contract: z.number(),
    error: z.number(),
  }),
  tokens: z.object({
    input: z.number(),
    output: z.number(),
    cacheRead: z.number(),
    total: z.number(),
  }),
  latency: z.object({
    p50: z.number().nullable(),
    p95: z.number().nullable(),
    /** 参与分位数计算的行数（latency_ms 为 0 的不算，见 summarizeUsage） */
    sampleSize: z.number(),
  }),
  daily: z.array(TrendPointSchema),
});

export const ActiveProviderMetricsSchema = z.object({
  label: z.string(),
  platform: z.string(),
  protocol: z.enum(['anthropic', 'openai_compatible']),
  model: z.string(),
  lastTestedAt: z.string().nullable(),
  lastTestOk: z.boolean().nullable(),
  lastTestError: z.string().nullable(),
});

export const DashboardMetricsSchema = z.object({
  generatedAt: z.string(),
  windowDays: z.number(),
  users: UserMetricsSchema,
  signupTrend: z.array(TrendPointSchema),
  activeUsers: ActiveUserMetricsSchema,
  content: ContentMetricsSchema,
  optimization: OptimizationMetricsSchema,
  usage: UsageMetricsSchema,
  /** 没有启用任何接入时为 null。**绝不包含 api key**，密文和明文都不行 */
  activeProvider: ActiveProviderMetricsSchema.nullable(),
});

export type UserMetrics = z.infer<typeof UserMetricsSchema>;
export type TrendPoint = z.infer<typeof TrendPointSchema>;
export type UsageMetrics = z.infer<typeof UsageMetricsSchema>;
export type OptimizationMetrics = z.infer<typeof OptimizationMetricsSchema>;
export type DashboardMetrics = z.infer<typeof DashboardMetricsSchema>;

/* ------------------------------------------------------------------ *
 * 纯计算
 *
 * 这一段刻意不碰数据库：除零、空数组、脏时间戳这些坑全在这里，单独测起来
 * 不需要造一个假的 supabase 客户端。
 * ------------------------------------------------------------------ */

/** 比率。分母为 0 时给 0——0/0 是 NaN，会一路印到页面上。 */
export function ratio(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

/** 保留一位小数，免得 0.30000000000000004 这种浮点尾巴出现在界面上。 */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 均值。**空数组给 null 而不是 0**：「平均提升 0 分」和「还没人优化过」是两回事。 */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * 分位数，最近秩法（nearest-rank）：排序后取第 ceil(p/100 × n) 个。
 *
 * 刻意不做插值。延迟本来就是离散的观测值，P95 报一个「实际发生过的耗时」
 * 比报一个插出来的、从没出现过的数字更好解释；也省掉了 n=1 时插值公式的
 * 边界讨论。空样本给 null，绝不是 0——0ms 会被读成「快得离谱」。
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? null;
}

/**
 * 把一组数值换算成 0..100 的柱高百分比。
 *
 * 页面画柱状图用。单独放在这里是因为它有两个必须钉住的边界：空数组时
 * Math.max() 返回 -Infinity，全 0 时除法得到 NaN——两者都会变成一个
 * `height: NaN%` 的内联样式，浏览器直接忽略，表现为「图没了」却不报错。
 */
export function barPercents(values: readonly number[]): number[] {
  // 用 reduce 而不是 Math.max(...values)：种子 0 顺手挡掉空数组那条路，
  // 也不受展开运算符的参数个数限制
  const max = values.reduce((acc, value) => (value > acc ? value : acc), 0);
  return values.map((value) => (max > 0 ? (value / max) * 100 : 0));
}

/** UTC 日期键，YYYY-MM-DD。 */
function dayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * 把一串时间戳汇成「最近 days 天、每天一格」的序列，没有数据的日子补 0。
 *
 * 按 **UTC** 切日，和 admin_signup_trend 里的 date_trunc 保持一致（数据库
 * 通常跑在 UTC 上）。两张图用同一套切法，横轴才对得上；混用本地时区会让
 * 两条曲线整体错开一格，而这种偏差在图上几乎看不出来。
 */
export function dailySeries(
  timestamps: readonly string[],
  days: number,
  now: Date,
): TrendPoint[] {
  const counts = new Map<string, number>();
  for (const timestamp of timestamps) {
    const parsed = Date.parse(timestamp);
    // 解析不出来的时间戳只丢这一条，不让整块指标跟着崩
    if (Number.isNaN(parsed)) continue;
    const key = dayKey(parsed);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const series: TrendPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const key = dayKey(todayUtc - offset * DAY_MS);
    series.push({ day: key, value: counts.get(key) ?? 0 });
  }
  return series;
}

export interface ActivityRow {
  user_id: string;
  created_at: string;
}

/**
 * 活跃用户：按 analyses.user_id 去重。
 *
 * 用「发起过分析」而不是「登录过」当活跃口径——这个产品的价值发生在分析
 * 那一步，打开 App 看一眼不算。三个窗口都是**滚动**的（最近 24h / 7d / 30d），
 * 不是自然日：按自然日算的话每天 UTC 零点一过 DAU 就掉回接近 0，看板上
 * 会像出了故障，其实只是刚过零点。
 */
export function countActiveUsers(
  rows: readonly ActivityRow[],
  now: Date,
): { dau: number; wau: number; mau: number } {
  const daily = new Set<string>();
  const weekly = new Set<string>();
  const monthly = new Set<string>();

  for (const row of rows) {
    const parsed = Date.parse(row.created_at);
    if (Number.isNaN(parsed)) continue;

    const age = now.getTime() - parsed;
    if (age < 0) continue; // 时钟漂移造成的未来时间，不计入任何窗口
    if (age <= DAY_MS) daily.add(row.user_id);
    if (age <= 7 * DAY_MS) weekly.add(row.user_id);
    if (age <= 30 * DAY_MS) monthly.add(row.user_id);
  }

  return { dau: daily.size, wau: weekly.size, mau: monthly.size };
}

export interface OptimizationRow {
  score_before: number;
  score_after: number;
}

/** 优化效果：平均提升、总提升分，以及优化前后的平均分。 */
export function summarizeOptimizations(
  rows: readonly OptimizationRow[],
  total: number,
): OptimizationMetrics {
  const gains = rows.map((row) => row.score_after - row.score_before);

  return {
    sample: { size: rows.length, truncated: total > rows.length },
    averageGain: mean(gains),
    // 合计和均值的空值处理刻意不同：一条记录都没有时「总共提升了 0 分」
    // 是成立的说法，「平均提升 0 分」不是
    totalGain: gains.reduce((sum, gain) => sum + gain, 0),
    averageScoreBefore: mean(rows.map((row) => row.score_before)),
    averageScoreAfter: mean(rows.map((row) => row.score_after)),
  };
}

export interface UsageRow {
  kind: Database['public']['Enums']['ai_call_kind'];
  status: Database['public']['Enums']['ai_call_status'];
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  latency_ms: number;
  created_at: string;
}

/** AI 调用：分组计数、成功率、token 合计、延迟分位数、按日调用量。 */
export function summarizeUsage(
  rows: readonly UsageRow[],
  total: number,
  now: Date,
): UsageMetrics {
  const byKind = { parse: 0, analyze: 0, draft: 0 };
  const byStatus = { ok: 0, refusal: 0, contract: 0, error: 0 };
  const tokens = { input: 0, output: 0, cacheRead: 0, total: 0 };
  const latencies: number[] = [];

  for (const row of rows) {
    byKind[row.kind] += 1;
    byStatus[row.status] += 1;
    tokens.input += row.input_tokens;
    tokens.output += row.output_tokens;
    tokens.cacheRead += row.cache_read_tokens;

    // latency_ms 有 not null default 0：埋点没测到耗时的时候写的就是 0。
    // 把这些 0 混进分位数会把 P50 直接拽到 0，看上去像「一半的调用是瞬间
    // 完成的」。它们代表「没测到」，不代表「零耗时」，所以排除。
    if (row.latency_ms > 0) latencies.push(row.latency_ms);
  }

  tokens.total = tokens.input + tokens.output;

  const sampleSize = rows.length;

  return {
    total,
    sample: { size: sampleSize, truncated: total > sampleSize },
    byKind,
    byStatus,
    rates: {
      ok: ratio(byStatus.ok, sampleSize),
      refusal: ratio(byStatus.refusal, sampleSize),
      contract: ratio(byStatus.contract, sampleSize),
      error: ratio(byStatus.error, sampleSize),
    },
    tokens,
    latency: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      sampleSize: latencies.length,
    },
    daily: dailySeries(
      rows.map((row) => row.created_at),
      TREND_DAYS,
      now,
    ),
  };
}

/* ------------------------------------------------------------------ *
 * 取数
 * ------------------------------------------------------------------ */

/**
 * 查询出错一律抛。
 *
 * 不吞掉换成 0：看板上的 0 会被当成「还没人用」，而真实原因可能是配置错了
 * 或者迁移没跑。这类故障沉默地过去比报错难查得多（db.ts 里那段是同一个
 * 道理）。
 */
function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) {
    throw new Error(`看板指标「${what}」查询失败：${result.error.message}`);
  }
  return result.data;
}

function mustCount(
  result: { count: number | null; error: { message: string } | null },
  what: string,
): number {
  if (result.error) {
    throw new Error(`看板指标「${what}」计数失败：${result.error.message}`);
  }
  // head + count 的响应体是空的，count 理论上一定有值；给个 0 兜底，
  // 免得一个 null 顺着往下变成 NaN
  return result.count ?? 0;
}

/**
 * 一次算齐首页要的全部指标。
 *
 * 所有查询并发发出去：它们互不依赖，串行的话首页要等十来个往返。
 *
 * 参数都有默认值，只有测试会显式传——注入客户端就不必给 lib/admin/db.ts
 * 打桩，注入 now 才能让「最近 30 天」这类断言不随执行时刻漂移。
 */
export async function loadDashboardMetrics(
  db: SupabaseClient<Database> = adminDb(),
  now: Date = new Date(),
): Promise<DashboardMetrics> {
  const activitySince = new Date(now.getTime() - TREND_DAYS * DAY_MS).toISOString();

  const [
    userStatsResult,
    signupTrendResult,
    activityResult,
    resumeCountResult,
    jobTargetCountResult,
    analysisCountResult,
    optimizationCountResult,
    optimizationRowsResult,
    usageCountResult,
    usageRowsResult,
    providerResult,
  ] = await Promise.all([
    // auth.users 不在 supabase-js 能 .from() 的 schema 里，也不该为了数个数
    // 就把它暴露出去；计数在数据库里一次算完（见迁移里的 security definer）
    db.rpc('admin_user_stats'),
    db.rpc('admin_signup_trend', { days: TREND_DAYS }),
    db
      .from('analyses')
      .select('user_id, created_at')
      .gte('created_at', activitySince)
      .order('created_at', { ascending: false })
      .limit(DETAIL_ROW_CAP),
    db.from('resumes').select('id', { count: 'exact', head: true }),
    db.from('job_targets').select('id', { count: 'exact', head: true }),
    db.from('analyses').select('id', { count: 'exact', head: true }),
    db.from('optimizations').select('id', { count: 'exact', head: true }),
    db
      .from('optimizations')
      .select('score_before, score_after')
      .order('created_at', { ascending: false })
      .limit(DETAIL_ROW_CAP),
    db.from('ai_usage').select('id', { count: 'exact', head: true }),
    db
      .from('ai_usage')
      .select(
        'kind, status, input_tokens, output_tokens, cache_read_tokens, latency_ms, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(DETAIL_ROW_CAP),
    // 只取展示要用的列。api_key_cipher 连查都不查——查不到就不可能不小心
    // 塞进响应体
    db
      .from('ai_providers')
      .select('label, platform, protocol, model, last_tested_at, last_test_ok, last_test_error')
      .eq('is_active', true)
      .maybeSingle(),
  ]);

  const userStatsRows = must(userStatsResult, '注册用户') ?? [];
  // 这个函数固定返回一行；空数组只可能出现在函数被改过的情况下，
  // 给一组 0 兜底，别让 undefined 漏进下游变成 NaN
  const userStats = userStatsRows[0] ?? {
    total: 0,
    new_today: 0,
    new_7d: 0,
    new_30d: 0,
    confirmed: 0,
  };

  const signupTrend = (must(signupTrendResult, '注册趋势') ?? []).map((point) => ({
    day: point.day,
    value: point.signups,
  }));

  const activityRows = must(activityResult, '活跃用户') ?? [];
  const optimizationRows = must(optimizationRowsResult, '优化效果') ?? [];
  const usageRows = must(usageRowsResult, 'AI 调用明细') ?? [];
  const provider = must(providerResult, '当前接入');

  const usageTotal = mustCount(usageCountResult, 'AI 调用总数');
  const optimizationTotal = mustCount(optimizationCountResult, '优化次数');

  return DashboardMetricsSchema.parse({
    generatedAt: now.toISOString(),
    windowDays: TREND_DAYS,
    users: {
      total: userStats.total,
      newToday: userStats.new_today,
      new7d: userStats.new_7d,
      new30d: userStats.new_30d,
      confirmed: userStats.confirmed,
      confirmedRate: ratio(userStats.confirmed, userStats.total),
    },
    signupTrend,
    activeUsers: countActiveUsers(activityRows, now),
    content: {
      resumes: mustCount(resumeCountResult, '简历数'),
      jobTargets: mustCount(jobTargetCountResult, '目标职位数'),
      analyses: mustCount(analysisCountResult, '分析次数'),
      optimizations: optimizationTotal,
    },
    optimization: summarizeOptimizations(optimizationRows, optimizationTotal),
    usage: summarizeUsage(usageRows, usageTotal, now),
    activeProvider: provider
      ? {
          label: provider.label,
          platform: provider.platform,
          protocol: provider.protocol,
          model: provider.model,
          lastTestedAt: provider.last_tested_at,
          lastTestOk: provider.last_test_ok,
          lastTestError: provider.last_test_error,
        }
      : null,
  });
}
