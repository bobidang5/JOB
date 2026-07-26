import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '../database.types';
import {
  UserMetricsSchema,
  barPercents,
  countActiveUsers,
  dailySeries,
  loadDashboardMetrics,
  mean,
  percentile,
  ratio,
  summarizeOptimizations,
  summarizeUsage,
  type UsageRow,
} from './metrics';

/**
 * 看板指标。
 *
 * 这里主要钉一件事：**空数据库不能产出 NaN**。新装的部署里注册数、调用数
 * 全是 0，而成功率、平均提升、P50/P95 全是除法或取样——JS 的 0/0 是 NaN、
 * Math.max() 是 -Infinity，它们会一路渗到页面上变成「NaN%」这种既不像空
 * 也不像坏的东西，还没有任何报错。所以下面既逐项断言，也把整份结果遍历一遍
 * 确认没有非有限数。
 *
 * 另一半是「算得对」：给一组手算得出答案的数据，核对成功率、平均提升和
 * 两个分位数。
 */

const NOW = new Date('2026-07-26T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/* ------------------------------------------------------------------ *
 * 假客户端
 *
 * 只实现 loadDashboardMetrics 用到的那几个链式方法。每个查询对象自己是
 * thenable，await 到它时按「表名 + 是不是 head 计数」挑一份预设结果。
 * ------------------------------------------------------------------ */

interface FakeDataset {
  userStats?: {
    total: number;
    new_today: number;
    new_7d: number;
    new_30d: number;
    confirmed: number;
  }[];
  signupTrend?: { day: string; signups: number }[];
  activityRows?: { user_id: string; created_at: string }[];
  optimizationRows?: { score_before: number; score_after: number }[];
  usageRows?: UsageRow[];
  counts?: Partial<Record<string, number>>;
  provider?: {
    label: string;
    platform: string;
    protocol: 'anthropic' | 'openai_compatible';
    model: string;
    last_tested_at: string | null;
    last_test_ok: boolean | null;
    last_test_error: string | null;
  } | null;
}

interface FakeResult {
  data: unknown;
  count: number | null;
  error: { message: string } | null;
}

function fakeClient(dataset: FakeDataset): SupabaseClient<Database> {
  const counts = dataset.counts ?? {};

  function resultFor(table: string, head: boolean): FakeResult {
    if (head) {
      return { data: null, count: counts[table] ?? 0, error: null };
    }
    switch (table) {
      case 'analyses':
        return { data: dataset.activityRows ?? [], count: null, error: null };
      case 'optimizations':
        return { data: dataset.optimizationRows ?? [], count: null, error: null };
      case 'ai_usage':
        return { data: dataset.usageRows ?? [], count: null, error: null };
      case 'ai_providers':
        return { data: dataset.provider ?? null, count: null, error: null };
      default:
        return { data: [], count: null, error: null };
    }
  }

  function makeQuery(table: string) {
    let head = false;
    const query = {
      // _columns 用不上，但得占住第一个位置才能拿到第二个参数里的 head
      select(_columns?: string, options?: { head?: boolean; count?: 'exact' }) {
        head = options?.head === true;
        return query;
      },
      eq: () => query,
      gte: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: () => query,
      then(resolve: (value: FakeResult) => unknown) {
        resolve(resultFor(table, head));
      },
    };
    return query;
  }

  const client = {
    from: (table: string) => makeQuery(table),
    rpc(name: string) {
      const data =
        name === 'admin_user_stats' ? (dataset.userStats ?? []) : (dataset.signupTrend ?? []);
      return {
        then(resolve: (value: FakeResult) => unknown) {
          resolve({ data, count: null, error: null });
        },
      };
    },
  };

  return client as unknown as SupabaseClient<Database>;
}

/** 把整份结果里的数字全找出来，用来断言「一个 NaN / Infinity 都没有」。 */
function collectNumbers(value: unknown, path = '$'): { path: string; value: number }[] {
  if (typeof value === 'number') return [{ path, value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectNumbers(item, `${path}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => collectNumbers(item, `${path}.${key}`));
  }
  return [];
}

/* ------------------------------------------------------------------ *
 * 纯计算
 * ------------------------------------------------------------------ */

describe('ratio', () => {
  it('分母为 0 时给 0，不是 NaN', () => {
    expect(ratio(0, 0)).toBe(0);
    expect(ratio(5, 0)).toBe(0);
    expect(Number.isNaN(ratio(0, 0))).toBe(false);
  });

  it('正常算比值', () => {
    expect(ratio(7, 10)).toBe(0.7);
    expect(ratio(1, 4)).toBe(0.25);
  });
});

describe('mean', () => {
  it('空数组给 null——「没有样本」不等于「平均 0」', () => {
    expect(mean([])).toBeNull();
  });

  it('保留一位小数，不留浮点尾巴', () => {
    expect(mean([10, 20, 30])).toBe(20);
    // 原始值是 6.666666666666667
    expect(mean([5, 6, 9])).toBe(6.7);
  });
});

describe('percentile', () => {
  it('空样本给 null，不是 0——0ms 会被读成「快得离谱」', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([], 95)).toBeNull();
  });

  it('最近秩法：10 个值时 P50 取第 5 个、P95 取第 10 个', () => {
    const values = [1000, 100, 900, 200, 800, 300, 700, 400, 600, 500];
    expect(percentile(values, 50)).toBe(500);
    expect(percentile(values, 95)).toBe(1000);
  });

  it('只有一个样本时两个分位数都是它', () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 95)).toBe(42);
  });

  it('不改动传进来的数组', () => {
    const values = [3, 1, 2];
    percentile(values, 50);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe('barPercents', () => {
  it('空数组给空数组——Math.max() 那条路会返回 -Infinity', () => {
    expect(barPercents([])).toEqual([]);
  });

  it('全是 0 时高度全给 0，不做 0/0', () => {
    const percents = barPercents([0, 0, 0]);
    expect(percents).toEqual([0, 0, 0]);
    expect(percents.every(Number.isFinite)).toBe(true);
  });

  it('按最大值归一到 0..100', () => {
    expect(barPercents([1, 2, 4])).toEqual([25, 50, 100]);
  });
});

describe('countActiveUsers', () => {
  it('没有记录时三个窗口都是 0', () => {
    expect(countActiveUsers([], NOW)).toEqual({ dau: 0, wau: 0, mau: 0 });
  });

  it('按 user_id 去重，窗口是滚动的', () => {
    const rows = [
      { user_id: 'A', created_at: new Date(NOW.getTime() - HOUR).toISOString() },
      // 同一个人再来一次，不该被数两遍
      { user_id: 'A', created_at: new Date(NOW.getTime() - 3 * DAY).toISOString() },
      { user_id: 'B', created_at: new Date(NOW.getTime() - 2 * DAY).toISOString() },
      { user_id: 'C', created_at: new Date(NOW.getTime() - 10 * DAY).toISOString() },
      // 超出 30 天，三个窗口都不算
      { user_id: 'D', created_at: new Date(NOW.getTime() - 40 * DAY).toISOString() },
    ];

    expect(countActiveUsers(rows, NOW)).toEqual({ dau: 1, wau: 2, mau: 3 });
  });

  it('坏时间戳只丢那一条，不影响其余', () => {
    const rows = [
      { user_id: 'A', created_at: '这不是时间' },
      { user_id: 'B', created_at: new Date(NOW.getTime() - HOUR).toISOString() },
    ];
    expect(countActiveUsers(rows, NOW)).toEqual({ dau: 1, wau: 1, mau: 1 });
  });
});

describe('dailySeries', () => {
  it('没有数据时补满 0，长度仍然是要的天数', () => {
    const series = dailySeries([], 30, NOW);
    expect(series).toHaveLength(30);
    expect(series.every((point) => point.value === 0)).toBe(true);
    expect(series[29]?.day).toBe('2026-07-26');
    expect(series[0]?.day).toBe('2026-06-27');
  });

  it('按 UTC 日归并，缺的日子补 0', () => {
    const series = dailySeries(
      [
        '2026-07-26T00:00:00.000Z',
        '2026-07-26T23:59:59.000Z',
        '2026-07-24T08:00:00.000Z',
        // 窗口之外的不计入，但也不该让函数出错
        '2025-01-01T00:00:00.000Z',
      ],
      3,
      NOW,
    );

    expect(series).toEqual([
      { day: '2026-07-24', value: 1 },
      { day: '2026-07-25', value: 0 },
      { day: '2026-07-26', value: 2 },
    ]);
  });
});

describe('summarizeOptimizations', () => {
  it('没有记录时均值是 null、合计是 0', () => {
    const summary = summarizeOptimizations([], 0);
    expect(summary.averageGain).toBeNull();
    expect(summary.averageScoreBefore).toBeNull();
    expect(summary.averageScoreAfter).toBeNull();
    expect(summary.totalGain).toBe(0);
    expect(summary.sample).toEqual({ size: 0, truncated: false });
  });

  it('平均提升与总提升按手算的来', () => {
    // 提升分别是 20 / 20 / 5 / 15，合计 60，平均 15
    const summary = summarizeOptimizations(
      [
        { score_before: 60, score_after: 80 },
        { score_before: 50, score_after: 70 },
        { score_before: 40, score_after: 45 },
        { score_before: 70, score_after: 85 },
      ],
      4,
    );

    expect(summary.totalGain).toBe(60);
    expect(summary.averageGain).toBe(15);
    expect(summary.averageScoreBefore).toBe(55);
    expect(summary.averageScoreAfter).toBe(70);
    expect(summary.sample.truncated).toBe(false);
  });

  it('总数大于取到的行数时标记为截断', () => {
    const summary = summarizeOptimizations([{ score_before: 10, score_after: 20 }], 5000);
    expect(summary.sample).toEqual({ size: 1, truncated: true });
  });
});

describe('summarizeUsage', () => {
  it('没有调用时比率全是 0、分位数是 null', () => {
    const summary = summarizeUsage([], 0, NOW);

    expect(summary.rates).toEqual({ ok: 0, refusal: 0, contract: 0, error: 0 });
    expect(summary.latency.p50).toBeNull();
    expect(summary.latency.p95).toBeNull();
    expect(summary.latency.sampleSize).toBe(0);
    expect(summary.tokens).toEqual({ input: 0, output: 0, cacheRead: 0, total: 0 });
    expect(summary.daily).toHaveLength(30);
    expect(collectNumbers(summary).every((entry) => Number.isFinite(entry.value))).toBe(true);
  });

  it('latency_ms 为 0 的行不进分位数——那是「没测到」不是「零耗时」', () => {
    const rows = [
      usageRow({ latency_ms: 0 }),
      usageRow({ latency_ms: 0 }),
      usageRow({ latency_ms: 400 }),
    ];
    const summary = summarizeUsage(rows, 3, NOW);

    expect(summary.latency.sampleSize).toBe(1);
    expect(summary.latency.p50).toBe(400);
  });

  it('全部没有耗时记录时分位数是 null 而不是 0', () => {
    const summary = summarizeUsage([usageRow({ latency_ms: 0 })], 1, NOW);
    expect(summary.latency.p50).toBeNull();
    expect(summary.latency.p95).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * 端到端聚合
 * ------------------------------------------------------------------ */

function usageRow(overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    kind: 'analyze',
    status: 'ok',
    input_tokens: 10,
    output_tokens: 5,
    cache_read_tokens: 2,
    latency_ms: 100,
    created_at: NOW.toISOString(),
    ...overrides,
  };
}

describe('loadDashboardMetrics：空数据库', () => {
  it('所有比率是 0、所有均值和分位数是 null，一个 NaN 都没有', async () => {
    const metrics = await loadDashboardMetrics(fakeClient({}), NOW);

    expect(metrics.users).toEqual({
      total: 0,
      newToday: 0,
      new7d: 0,
      new30d: 0,
      confirmed: 0,
      confirmedRate: 0,
    });
    expect(metrics.activeUsers).toEqual({ dau: 0, wau: 0, mau: 0 });
    expect(metrics.content).toEqual({
      resumes: 0,
      jobTargets: 0,
      analyses: 0,
      optimizations: 0,
    });

    expect(metrics.optimization.averageGain).toBeNull();
    expect(metrics.optimization.averageScoreBefore).toBeNull();
    expect(metrics.optimization.averageScoreAfter).toBeNull();
    expect(metrics.optimization.totalGain).toBe(0);

    expect(metrics.usage.total).toBe(0);
    expect(metrics.usage.rates).toEqual({ ok: 0, refusal: 0, contract: 0, error: 0 });
    expect(metrics.usage.latency.p50).toBeNull();
    expect(metrics.usage.latency.p95).toBeNull();
    expect(metrics.usage.sample).toEqual({ size: 0, truncated: false });

    expect(metrics.signupTrend).toEqual([]);
    expect(metrics.usage.daily).toHaveLength(30);
    expect(metrics.activeProvider).toBeNull();

    // 逐个数字确认：NaN、Infinity、-Infinity 一个都不能有
    const bad = collectNumbers(metrics).filter((entry) => !Number.isFinite(entry.value));
    expect(bad).toEqual([]);
  });
});

describe('loadDashboardMetrics：已知数据', () => {
  const dataset: FakeDataset = {
    userStats: [{ total: 10, new_today: 2, new_7d: 5, new_30d: 8, confirmed: 4 }],
    signupTrend: [
      { day: '2026-07-25', signups: 1 },
      { day: '2026-07-26', signups: 3 },
    ],
    activityRows: [
      { user_id: 'A', created_at: new Date(NOW.getTime() - HOUR).toISOString() },
      { user_id: 'A', created_at: new Date(NOW.getTime() - 3 * DAY).toISOString() },
      { user_id: 'B', created_at: new Date(NOW.getTime() - 2 * DAY).toISOString() },
      { user_id: 'C', created_at: new Date(NOW.getTime() - 10 * DAY).toISOString() },
    ],
    optimizationRows: [
      { score_before: 60, score_after: 80 },
      { score_before: 50, score_after: 70 },
      { score_before: 40, score_after: 45 },
      { score_before: 70, score_after: 85 },
    ],
    // 10 行：7 成功 / 1 拒答 / 1 契约 / 1 错误；耗时 100..1000；
    // 用途 4 解析 / 5 分析 / 1 起草
    usageRows: [
      usageRow({ kind: 'parse', latency_ms: 100 }),
      usageRow({ kind: 'parse', latency_ms: 200 }),
      usageRow({ kind: 'parse', latency_ms: 300 }),
      usageRow({ kind: 'parse', latency_ms: 400, status: 'refusal' }),
      usageRow({ kind: 'analyze', latency_ms: 500 }),
      usageRow({ kind: 'analyze', latency_ms: 600 }),
      usageRow({ kind: 'analyze', latency_ms: 700 }),
      usageRow({ kind: 'analyze', latency_ms: 800, status: 'contract' }),
      usageRow({
        kind: 'analyze',
        latency_ms: 900,
        status: 'error',
        created_at: '2026-07-25T09:00:00.000Z',
      }),
      usageRow({ kind: 'draft', latency_ms: 1000, created_at: '2026-07-20T09:00:00.000Z' }),
    ],
    counts: {
      resumes: 7,
      job_targets: 5,
      analyses: 12,
      optimizations: 4,
      // 比取回的 10 行多，用来验证「总次数走全量、明细标记截断」
      ai_usage: 12,
    },
    provider: {
      label: 'Anthropic 生产',
      platform: 'anthropic',
      protocol: 'anthropic',
      model: 'claude-opus-5',
      last_tested_at: '2026-07-26T09:00:00.000Z',
      last_test_ok: true,
      last_test_error: null,
    },
  };

  it('注册与内容量直接来自计数', async () => {
    const metrics = await loadDashboardMetrics(fakeClient(dataset), NOW);

    expect(metrics.users.total).toBe(10);
    expect(metrics.users.newToday).toBe(2);
    expect(metrics.users.new7d).toBe(5);
    expect(metrics.users.new30d).toBe(8);
    expect(metrics.users.confirmed).toBe(4);
    // 4 / 10
    expect(metrics.users.confirmedRate).toBe(0.4);

    expect(metrics.content).toEqual({
      resumes: 7,
      jobTargets: 5,
      analyses: 12,
      optimizations: 4,
    });
    expect(metrics.signupTrend).toEqual([
      { day: '2026-07-25', value: 1 },
      { day: '2026-07-26', value: 3 },
    ]);
  });

  it('活跃用户按 user_id 去重', async () => {
    const metrics = await loadDashboardMetrics(fakeClient(dataset), NOW);
    expect(metrics.activeUsers).toEqual({ dau: 1, wau: 2, mau: 3 });
  });

  it('优化效果：平均提升 15 分、累计 60 分', async () => {
    const metrics = await loadDashboardMetrics(fakeClient(dataset), NOW);

    expect(metrics.optimization.averageGain).toBe(15);
    expect(metrics.optimization.totalGain).toBe(60);
    expect(metrics.optimization.averageScoreBefore).toBe(55);
    expect(metrics.optimization.averageScoreAfter).toBe(70);
  });

  it('AI 调用：成功率 70%、P50 = 500ms、P95 = 1000ms', async () => {
    const metrics = await loadDashboardMetrics(fakeClient(dataset), NOW);

    expect(metrics.usage.total).toBe(12);
    expect(metrics.usage.sample).toEqual({ size: 10, truncated: true });

    expect(metrics.usage.byStatus).toEqual({ ok: 7, refusal: 1, contract: 1, error: 1 });
    expect(metrics.usage.byKind).toEqual({ parse: 4, analyze: 5, draft: 1 });

    // 比率的分母是取回来的 10 行，不是全量 12
    expect(metrics.usage.rates.ok).toBe(0.7);
    expect(metrics.usage.rates.refusal).toBe(0.1);
    expect(metrics.usage.rates.contract).toBe(0.1);
    expect(metrics.usage.rates.error).toBe(0.1);

    // 10 行 × 每行 10 / 5 / 2
    expect(metrics.usage.tokens).toEqual({
      input: 100,
      output: 50,
      cacheRead: 20,
      total: 150,
    });

    expect(metrics.usage.latency.sampleSize).toBe(10);
    expect(metrics.usage.latency.p50).toBe(500);
    expect(metrics.usage.latency.p95).toBe(1000);
  });

  it('最近 30 天调用量按 UTC 日归并', async () => {
    const metrics = await loadDashboardMetrics(fakeClient(dataset), NOW);
    const daily = metrics.usage.daily;

    expect(daily).toHaveLength(30);
    // 8 条落在今天，1 条 7-25，1 条 7-20
    expect(daily.at(-1)).toEqual({ day: '2026-07-26', value: 8 });
    expect(daily.find((point) => point.day === '2026-07-25')).toEqual({
      day: '2026-07-25',
      value: 1,
    });
    expect(daily.find((point) => point.day === '2026-07-20')).toEqual({
      day: '2026-07-20',
      value: 1,
    });
    expect(daily.reduce((sum, point) => sum + point.value, 0)).toBe(10);
  });

  it('当前接入只回展示用的字段，不含任何 key', async () => {
    const metrics = await loadDashboardMetrics(fakeClient(dataset), NOW);

    expect(metrics.activeProvider).toEqual({
      label: 'Anthropic 生产',
      platform: 'anthropic',
      protocol: 'anthropic',
      model: 'claude-opus-5',
      lastTestedAt: '2026-07-26T09:00:00.000Z',
      lastTestOk: true,
      lastTestError: null,
    });

    const serialized = JSON.stringify(metrics);
    expect(serialized).not.toMatch(/api_key|apiKey|cipher/i);
  });

  it('整份结果里没有非有限数', async () => {
    const metrics = await loadDashboardMetrics(fakeClient(dataset), NOW);
    const bad = collectNumbers(metrics).filter((entry) => !Number.isFinite(entry.value));
    expect(bad).toEqual([]);
  });
});

describe('返回契约本身就是最后一道闸', () => {
  it('NaN 过不了 Zod 的 z.number()', () => {
    // 万一哪天有人在上面加了一处没防住的除法，parse 会当场抛，
    // 而不是把 NaN 印到页面上。这条断言钉住这个前提。
    const result = UserMetricsSchema.safeParse({
      total: 0,
      newToday: 0,
      new7d: 0,
      new30d: 0,
      confirmed: 0,
      confirmedRate: Number.NaN,
    });
    expect(result.success).toBe(false);
  });

  it('Infinity 同样过不了', () => {
    const result = UserMetricsSchema.safeParse({
      total: 0,
      newToday: 0,
      new7d: 0,
      new30d: 0,
      confirmed: 0,
      confirmedRate: Number.POSITIVE_INFINITY,
    });
    expect(result.success).toBe(false);
  });
});

describe('查询出错', () => {
  it('直接抛，不把 0 当成「没人用」显示出去', async () => {
    const broken = {
      from: () => ({
        select: () => broken.from(),
        eq: () => broken.from(),
        gte: () => broken.from(),
        order: () => broken.from(),
        limit: () => broken.from(),
        maybeSingle: () => broken.from(),
        then(resolve: (value: FakeResult) => unknown) {
          resolve({ data: null, count: null, error: { message: 'permission denied' } });
        },
      }),
      rpc: () => ({
        then(resolve: (value: FakeResult) => unknown) {
          resolve({ data: null, count: null, error: { message: 'permission denied' } });
        },
      }),
    };

    await expect(
      loadDashboardMetrics(broken as unknown as SupabaseClient<Database>, NOW),
    ).rejects.toThrow(/permission denied/);
  });
});
