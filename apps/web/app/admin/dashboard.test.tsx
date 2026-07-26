import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { dailySeries, type DashboardMetrics } from '../../lib/admin/metrics';
import { Dashboard } from './page';

/**
 * 看板的渲染。
 *
 * lib/admin/metrics.test.ts 钉的是「算出来的数不是 NaN」，这里钉的是「印到
 * 页面上的字不是 NaN」——中间还隔着一层格式化，`(null * 100).toFixed(1)`
 * 这种写法在聚合层测不出来，得把 HTML 渲出来看。
 *
 * 空数据那条尤其重要：一套刚装好的部署打开后台，看到的就是这一屏。
 */

const NOW = new Date('2026-07-26T12:00:00.000Z');

/** 全新部署：一个用户、一次调用都没有 */
const EMPTY: DashboardMetrics = {
  generatedAt: NOW.toISOString(),
  windowDays: 30,
  users: { total: 0, newToday: 0, new7d: 0, new30d: 0, confirmed: 0, confirmedRate: 0 },
  signupTrend: [],
  activeUsers: { dau: 0, wau: 0, mau: 0 },
  content: { resumes: 0, jobTargets: 0, analyses: 0, optimizations: 0 },
  optimization: {
    sample: { size: 0, truncated: false },
    averageGain: null,
    totalGain: 0,
    averageScoreBefore: null,
    averageScoreAfter: null,
  },
  usage: {
    total: 0,
    sample: { size: 0, truncated: false },
    byKind: { parse: 0, analyze: 0, draft: 0 },
    byStatus: { ok: 0, refusal: 0, contract: 0, error: 0 },
    rates: { ok: 0, refusal: 0, contract: 0, error: 0 },
    tokens: { input: 0, output: 0, cacheRead: 0, total: 0 },
    latency: { p50: null, p95: null, sampleSize: 0 },
    daily: dailySeries([], 30, NOW),
  },
  activeProvider: null,
};

/** 与 metrics.test.ts 里那组已知数据对应，用来核对格式化 */
const FILLED: DashboardMetrics = {
  ...EMPTY,
  users: { total: 10, newToday: 2, new7d: 5, new30d: 8, confirmed: 4, confirmedRate: 0.4 },
  signupTrend: [
    { day: '2026-07-24', value: 0 },
    { day: '2026-07-25', value: 1 },
    { day: '2026-07-26', value: 3 },
  ],
  activeUsers: { dau: 1, wau: 2, mau: 3 },
  content: { resumes: 7, jobTargets: 5, analyses: 12, optimizations: 4 },
  optimization: {
    sample: { size: 4, truncated: false },
    averageGain: 15,
    totalGain: 60,
    averageScoreBefore: 55,
    averageScoreAfter: 70,
  },
  usage: {
    ...EMPTY.usage,
    total: 12,
    sample: { size: 10, truncated: true },
    byKind: { parse: 4, analyze: 5, draft: 1 },
    byStatus: { ok: 7, refusal: 1, contract: 1, error: 1 },
    rates: { ok: 0.7, refusal: 0.1, contract: 0.1, error: 0.1 },
    tokens: { input: 100, output: 50, cacheRead: 20, total: 150 },
    latency: { p50: 500, p95: 1000, sampleSize: 10 },
    daily: dailySeries(['2026-07-26T00:00:00.000Z', '2026-07-25T00:00:00.000Z'], 30, NOW),
  },
  activeProvider: {
    label: 'Anthropic 生产',
    platform: 'anthropic',
    protocol: 'anthropic',
    model: 'claude-opus-5',
    lastTestedAt: '2026-07-26T09:00:00.000Z',
    lastTestOk: true,
    lastTestError: null,
  },
};

describe('空数据的看板', () => {
  const html = renderToStaticMarkup(<Dashboard metrics={EMPTY} />);

  it('页面上没有 NaN、Infinity，也没有 undefined', () => {
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('每一块没有数据的地方都给一句人话，不是空白也不是 0%', () => {
    expect(html).toContain('还没有任何数据');
    expect(html).toContain('最近 30 天没有新注册');
    expect(html).toContain('还没有人完成过一次优化');
    expect(html).toContain('还没有任何模型调用记录');
    expect(html).toContain('还没有启用任何接入');
  });

  it('计数照实显示 0——那是真实的计数，不该藏起来', () => {
    expect(html).toContain('总数');
    expect(html).toContain('>0<');
  });
});

describe('有数据的看板', () => {
  const html = renderToStaticMarkup(<Dashboard metrics={FILLED} />);

  it('页面上没有 NaN、Infinity', () => {
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it('比率、分位数、提升分按约定的样子显示', () => {
    expect(html).toContain('70.0%'); // 成功率
    expect(html).toContain('40.0%'); // 已验证邮箱占比
    expect(html).toContain('500 ms'); // P50
    expect(html).toContain('1.0 s'); // P95 超过 1 秒改用秒
    expect(html).toContain('+15 分'); // 平均提升
    expect(html).toContain('+60 分'); // 累计提升
  });

  it('取样被截断时说清楚哪些数是全量、哪些是样本', () => {
    expect(html).toContain('总次数为全量，其余指标基于最近 10 次调用');
  });

  it('接入信息只有展示字段，页面上不会出现任何 key', () => {
    expect(html).toContain('claude-opus-5');
    expect(html).not.toMatch(/api_key|apiKey|cipher|sk-/i);
  });
});
