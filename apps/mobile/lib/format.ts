/**
 * 记录列表副标题里的时间（截图 03：「昨天 · 投向字节跳动」/
 * 「7月20日 · 投向美团」，刚完成一次优化则是「刚刚」）。
 *
 * now 显式传入而不是内部取 Date.now()，这样测试不需要打桩时钟。
 */
export function formatRecordDate(at: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - at.getTime();

  // 一小时内算「刚刚」——对应原型 finishAll() 插入记录时的文案
  if (diffMs >= 0 && diffMs < 60 * 60 * 1000) return '刚刚';

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);

  if (dayDiff === 0) return '今天';
  if (dayDiff === 1) return '昨天';

  const month = at.getMonth() + 1;
  const day = at.getDate();
  if (at.getFullYear() === now.getFullYear()) return `${month}月${day}日`;
  return `${at.getFullYear()}年${month}月${day}日`;
}

/** 「昨天 · 投向字节跳动」 */
export function formatRecordSubtitle(
  at: Date,
  company: string,
  now: Date = new Date(),
): string {
  const when = formatRecordDate(at, now);
  return company.trim().length > 0 ? `${when} · 投向${company}` : when;
}

/**
 * 记录页副标题：「共优化 6 次 · 平均每次 +9 分」。
 * 原型里是 `4 + records.length` 的假数据，这里按真实记录算。
 */
export function summarizeRecords(
  records: readonly { scoreBefore: number; scoreAfter: number }[],
): { count: number; averageGain: number } {
  if (records.length === 0) return { count: 0, averageGain: 0 };
  const total = records.reduce((sum, r) => sum + (r.scoreAfter - r.scoreBefore), 0);
  return {
    count: records.length,
    averageGain: Math.round(total / records.length),
  };
}
