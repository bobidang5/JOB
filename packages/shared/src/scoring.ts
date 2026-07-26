import type { Profile, ResumeContent, Suggestion } from './schemas';

/**
 * DESIGN-SPEC §5.3 的计分规则。
 *
 * 原型写死「初始 76 / 每采纳 +2 / 上限 84」。这里表达为通用公式：
 *
 *     score_after = min(score_before + Σ(采纳项的 score_delta), max_score)
 *
 * MockAIService 把每条 score_delta 设为 2、max_score 设为 84，于是逐位
 * 复现原型；ClaudeAIService 由模型给出各自的分值，走同一个公式。前端
 * 代码路径完全一致。
 */
export function computeScoreAfter(
  scoreBefore: number,
  adopted: readonly Pick<Suggestion, 'score_delta'>[],
  maxScore: number,
): number {
  const gained = adopted.reduce((sum, s) => sum + s.score_delta, 0);
  return Math.min(scoreBefore + gained, maxScore);
}

/* ============================================================
 * 把采纳的建议写回简历内容
 * ========================================================== */

const EXP_BULLET = /^exp\[(\d+)\]\.lis\[(\d+)\]$/;
const PROJECT_BULLET = /^projects\[(\d+)\]\.lis\[(\d+)\]$/;

/**
 * 按 field_path 把一条改写写入简历内容，返回新对象（不修改入参）。
 *
 * field_path 来自 LLM，所以这里只认 schemas.ts 白名单里的四种形式，
 * 且下标必须落在现有数组范围内——绝不做动态属性写入，也绝不为了让
 * 一条建议生效而凭空创建段落。路径无法解析时原样返回，调用方据此
 * 判断该建议是否真的落地。
 */
export function applySuggestion(
  content: ResumeContent,
  fieldPath: string,
  text: string,
): { content: ResumeContent; applied: boolean } {
  const next: ResumeContent = JSON.parse(JSON.stringify(content));

  if (fieldPath === 'summary') {
    next.summary = text;
    return { content: next, applied: true };
  }

  if (fieldPath === 'skills') {
    next.skills = text;
    return { content: next, applied: true };
  }

  const expMatch = EXP_BULLET.exec(fieldPath);
  if (expMatch) {
    const entry = next.exp[Number(expMatch[1])];
    const bulletIndex = Number(expMatch[2]);
    if (entry && bulletIndex < entry.lis.length) {
      entry.lis[bulletIndex] = text;
      return { content: next, applied: true };
    }
    return { content, applied: false };
  }

  const projectMatch = PROJECT_BULLET.exec(fieldPath);
  if (projectMatch) {
    const entry = next.projects[Number(projectMatch[1])];
    const bulletIndex = Number(projectMatch[2]);
    if (entry && bulletIndex < entry.lis.length) {
      entry.lis[bulletIndex] = text;
      return { content: next, applied: true };
    }
    return { content, applied: false };
  }

  return { content, applied: false };
}

/** 依次写入全部采纳项，并报告哪些因路径失效而没落地。 */
export function applySuggestions(
  content: ResumeContent,
  adopted: readonly Suggestion[],
): { content: ResumeContent; skipped: Suggestion[] } {
  let current = content;
  const skipped: Suggestion[] = [];

  for (const suggestion of adopted) {
    const result = applySuggestion(
      current,
      suggestion.field_path,
      suggestion.suggested_text,
    );
    if (result.applied) {
      current = result.content;
    } else {
      skipped.push(suggestion);
    }
  }

  return { content: current, skipped };
}

/* ============================================================
 * 展示辅助
 * ========================================================== */

/**
 * 拼装简历基本信息栏（截图 05 底部：「资料会用于生成简历基本信息栏」）。
 * 空字段直接跳过，避免出现「· · 」这种空洞分隔。
 */
export function formatResumeMeta(profile: Profile): string {
  return [
    profile.job_intent,
    profile.years_experience === null
      ? ''
      : `${profile.years_experience} 年经验`,
    profile.city,
    profile.email,
    profile.phone,
  ]
    .filter((part) => part.trim().length > 0)
    .join(' · ');
}

export type ScoreHint =
  | { kind: 'fresh' }
  | { kind: 'improvable'; count: number };

/**
 * 首页分数卡副标题的分支（原型 render()：>=84 显示「刚优化过，状态很好」，
 * >=80 显示「还有 2 处可以提升」，否则「还有 3 处可以提升」）。
 *
 * pendingCount 传入时以真实待优化条数为准；没有分析记录时回退到原型阈值。
 */
export function scoreHint(score: number, pendingCount?: number): ScoreHint {
  if (pendingCount !== undefined) {
    return pendingCount === 0
      ? { kind: 'fresh' }
      : { kind: 'improvable', count: pendingCount };
  }
  if (score >= 84) return { kind: 'fresh' };
  return { kind: 'improvable', count: score >= 80 ? 2 : 3 };
}

/**
 * 把 suggested_text 按 emphasis 切成「普通 / 高亮」交替的片段，供 RN 渲染。
 * 原型用 <b> 标签实现同样的效果。
 */
export function splitEmphasis(
  text: string,
  emphasis: readonly string[],
): { text: string; highlighted: boolean }[] {
  const terms = emphasis.filter((t) => t.length > 0);
  if (terms.length === 0) return [{ text, highlighted: false }];

  const segments: { text: string; highlighted: boolean }[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    // 在剩余文本里找最早出现的强调词；同位置取更长的，避免部分匹配。
    let bestIndex = -1;
    let bestTerm = '';
    for (const term of terms) {
      const index = text.indexOf(term, cursor);
      if (index === -1) continue;
      if (
        bestIndex === -1 ||
        index < bestIndex ||
        (index === bestIndex && term.length > bestTerm.length)
      ) {
        bestIndex = index;
        bestTerm = term;
      }
    }

    if (bestIndex === -1) {
      segments.push({ text: text.slice(cursor), highlighted: false });
      break;
    }

    if (bestIndex > cursor) {
      segments.push({ text: text.slice(cursor, bestIndex), highlighted: false });
    }
    segments.push({ text: bestTerm, highlighted: true });
    cursor = bestIndex + bestTerm.length;
  }

  return segments;
}
