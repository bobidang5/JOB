/**
 * DESIGN-SPEC §5.2（计分）。
 *
 * 规则本身住在 packages/shared/src/scoring.ts，App 只是调用方；这里从
 * apps/mobile 侧测，是为了同时验证「mobile 能按 mock provider 的真实
 * 数据（每条 +2、上限 84）跑出原型写死的那条曲线」。
 */
import {
  MOCK_ANALYSIS,
  MOCK_BASE_SCORE,
  MOCK_MAX_SCORE,
  MOCK_RESUME_BEFORE,
  applySuggestions,
  computeScoreAfter,
  type ResumeContent,
  type Suggestion,
} from '@zhiyou/shared';

/** 造一条 delta=2 的建议，field_path 默认落在必然存在的 summary 上 */
function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    tag: '自我评价 · 去空话',
    original_text: '性格开朗',
    suggested_text: '3 年增长型产品人',
    emphasis: [],
    rationale: '少形容词',
    score_delta: 2,
    field_path: 'summary',
    ...overrides,
  };
}

describe('§5.2 计分：初始 76，每采纳 1 条 +2，上限 84', () => {
  it.each([
    [0, 76],
    [1, 78],
    [2, 80],
    [3, 82],
    [4, 84],
    [5, 84],
  ])('采纳 %i 条得 %i 分', (adoptedCount, expected) => {
    const adopted = Array.from({ length: adoptedCount }, () => suggestion());

    expect(computeScoreAfter(MOCK_BASE_SCORE, adopted, MOCK_MAX_SCORE)).toBe(expected);
    // 公式即 min(76 + 2n, 84)
    expect(expected).toBe(Math.min(MOCK_BASE_SCORE + 2 * adoptedCount, MOCK_MAX_SCORE));
  });

  it('mock provider 的每条建议 delta 都是 2、上限是 84', () => {
    expect(MOCK_ANALYSIS.max_score).toBe(84);
    expect(MOCK_ANALYSIS.suggestions.map((s) => s.score_delta)).toEqual(
      MOCK_ANALYSIS.suggestions.map(() => 2),
    );
  });

  it('全部采纳 mock 的四条建议，76 → 84', () => {
    expect(
      computeScoreAfter(
        MOCK_BASE_SCORE,
        MOCK_ANALYSIS.suggestions,
        MOCK_ANALYSIS.max_score,
      ),
    ).toBe(84);
  });

  it('封顶后再采纳也不会超过上限', () => {
    const many = Array.from({ length: 20 }, () => suggestion());
    expect(computeScoreAfter(MOCK_BASE_SCORE, many, MOCK_MAX_SCORE)).toBe(MOCK_MAX_SCORE);
  });
});

describe('§5.2 采纳落地：applySuggestions 只认白名单 field_path', () => {
  it('mock 的四条建议全部能写回 MOCK_RESUME_BEFORE，没有一条被跳过', () => {
    const { content, skipped } = applySuggestions(
      MOCK_RESUME_BEFORE,
      MOCK_ANALYSIS.suggestions,
    );

    expect(skipped).toEqual([]);
    expect(content.summary).toBe('3 年增长型产品人：擅长用数据实验驱动转化提升');
    expect(content.skills).toBe('熟练使用 SQL 与 A/B 测试 支撑增长决策');
    expect(content.exp[0]?.lis[0]).toBe(
      '主导 2 条核心产品线运营，3 个月内推动 DAU 增长 25%',
    );
    expect(content.projects[0]?.lis[0]).toBe(
      '独立负责签到裂变项目，新客获客成本降低 32%',
    );
  });

  it('不修改入参', () => {
    const before: ResumeContent = JSON.parse(JSON.stringify(MOCK_RESUME_BEFORE));
    applySuggestions(MOCK_RESUME_BEFORE, MOCK_ANALYSIS.suggestions);
    expect(MOCK_RESUME_BEFORE).toEqual(before);
  });

  it.each([
    ['name'],
    ['meta'],
    ['edu'],
    ['__proto__'],
    ['constructor.prototype.polluted'],
    ['exp[0].co'],
    ['exp[9].lis[0]'],
    ['exp[0].lis[9]'],
    ['projects[9].lis[0]'],
    ['projects[0].lis[9]'],
    ['summary '],
  ])('非白名单 field_path %s 被跳过而不是写入', (fieldPath) => {
    const adopted = [suggestion({ field_path: fieldPath, suggested_text: '恶意写入' })];
    const { content, skipped } = applySuggestions(MOCK_RESUME_BEFORE, adopted);

    expect(skipped).toEqual(adopted);
    // 简历内容原封不动
    expect(content).toEqual(MOCK_RESUME_BEFORE);
    expect(JSON.stringify(content)).not.toContain('恶意写入');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('跳过的那条不影响其它条落地', () => {
    const adopted = [
      suggestion({ field_path: 'exp[7].lis[0]', suggested_text: '落不了地' }),
      suggestion({ field_path: 'skills', suggested_text: 'SQL / A/B 测试' }),
    ];
    const { content, skipped } = applySuggestions(MOCK_RESUME_BEFORE, adopted);

    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.suggested_text).toBe('落不了地');
    expect(content.skills).toBe('SQL / A/B 测试');
  });

  it('被跳过的建议照样计分——分数由 score_delta 决定，与是否落地无关', () => {
    // 记录这一处实现事实：computeScoreAfter 的入参是「用户采纳的条数」，
    // applySuggestions 的 skipped 不会回头扣分。真实 provider 给出的
    // field_path 都经过 schema 校验，两者一致；这里锁住行为，将来若要
    // 改成「跳过的不计分」会先在这条用例上红。
    const adopted = [suggestion({ field_path: 'exp[7].lis[0]' })];
    expect(computeScoreAfter(MOCK_BASE_SCORE, adopted, MOCK_MAX_SCORE)).toBe(78);
    expect(applySuggestions(MOCK_RESUME_BEFORE, adopted).skipped).toHaveLength(1);
  });
});
