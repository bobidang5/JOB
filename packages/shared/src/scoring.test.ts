import { describe, expect, it } from 'vitest';

import {
  MOCK_ANALYSIS,
  MOCK_BASE_SCORE,
  MOCK_MAX_SCORE,
  MOCK_RESUME_BEFORE,
} from './mock/index';
import {
  applySuggestion,
  applySuggestions,
  computeScoreAfter,
  formatResumeMeta,
  scoreHint,
  splitEmphasis,
} from './scoring';
import { FieldPathSchema } from './schemas';

describe('计分规则（DESIGN-SPEC §5.3）', () => {
  const suggestions = MOCK_ANALYSIS.suggestions;

  it('采纳 0–4 条分别得 76 / 78 / 80 / 82 / 84', () => {
    const expected = [76, 78, 80, 82, 84];
    for (let n = 0; n <= 4; n += 1) {
      expect(
        computeScoreAfter(
          MOCK_BASE_SCORE,
          suggestions.slice(0, n),
          MOCK_MAX_SCORE,
        ),
      ).toBe(expected[n]);
    }
  });

  it('封顶在 max_score，不会超过 84', () => {
    const many = Array.from({ length: 20 }, () => ({ score_delta: 2 }));
    expect(computeScoreAfter(MOCK_BASE_SCORE, many, MOCK_MAX_SCORE)).toBe(84);
  });

  it('起始分本身高于上限时保持不变', () => {
    expect(computeScoreAfter(90, [{ score_delta: 2 }], 84)).toBe(84);
  });
});

describe('field_path 校验', () => {
  it('接受白名单内的四种形式', () => {
    for (const path of [
      'summary',
      'skills',
      'exp[0].lis[1]',
      'projects[2].lis[0]',
    ]) {
      expect(FieldPathSchema.safeParse(path).success).toBe(true);
    }
  });

  it('拒绝模型可能编造的其它路径', () => {
    for (const path of [
      'name',
      '__proto__',
      'exp.lis[0]',
      'exp[0]',
      'exp[0].co',
      'constructor.prototype.x',
      'exp[0].lis[0]; drop table',
      '',
    ]) {
      expect(FieldPathSchema.safeParse(path).success).toBe(false);
    }
  });

  it('mock 里每条建议的 field_path 都合法', () => {
    for (const suggestion of MOCK_ANALYSIS.suggestions) {
      expect(FieldPathSchema.safeParse(suggestion.field_path).success).toBe(
        true,
      );
    }
  });
});

describe('把建议写回简历', () => {
  it('四条 mock 建议全部能在优化前的简历上落地', () => {
    const { content, skipped } = applySuggestions(
      MOCK_RESUME_BEFORE,
      MOCK_ANALYSIS.suggestions,
    );

    expect(skipped).toEqual([]);
    expect(content.exp[0]?.lis[0]).toBe(
      '主导 2 条核心产品线运营，3 个月内推动 DAU 增长 25%',
    );
    expect(content.skills).toBe('熟练使用 SQL 与 A/B 测试 支撑增长决策');
    expect(content.summary).toBe('3 年增长型产品人：擅长用数据实验驱动转化提升');
    expect(content.projects[0]?.lis[0]).toBe(
      '独立负责签到裂变项目，新客获客成本降低 32%',
    );
  });

  it('不修改传入的对象', () => {
    const before = JSON.stringify(MOCK_RESUME_BEFORE);
    applySuggestions(MOCK_RESUME_BEFORE, MOCK_ANALYSIS.suggestions);
    expect(JSON.stringify(MOCK_RESUME_BEFORE)).toBe(before);
  });

  it('下标越界时不落地，也不凭空创建段落', () => {
    const result = applySuggestion(MOCK_RESUME_BEFORE, 'exp[9].lis[0]', 'x');
    expect(result.applied).toBe(false);
    expect(result.content.exp).toHaveLength(2);
  });

  it('未知路径不落地', () => {
    expect(applySuggestion(MOCK_RESUME_BEFORE, 'name', '张三').applied).toBe(
      false,
    );
    expect(
      applySuggestion(MOCK_RESUME_BEFORE, '__proto__', 'x').applied,
    ).toBe(false);
  });

  it('跳过的建议会被报告出来', () => {
    const bad = {
      ...MOCK_ANALYSIS.suggestions[0]!,
      field_path: 'exp[9].lis[9]',
    };
    const { skipped } = applySuggestions(MOCK_RESUME_BEFORE, [bad]);
    expect(skipped).toHaveLength(1);
  });
});

describe('首页分数副标题分支（原型 render()）', () => {
  it('无分析记录时回落到原型阈值', () => {
    expect(scoreHint(84)).toEqual({ kind: 'fresh' });
    expect(scoreHint(90)).toEqual({ kind: 'fresh' });
    expect(scoreHint(80)).toEqual({ kind: 'improvable', count: 2 });
    expect(scoreHint(76)).toEqual({ kind: 'improvable', count: 3 });
  });

  it('有真实待优化条数时以它为准', () => {
    expect(scoreHint(76, 0)).toEqual({ kind: 'fresh' });
    expect(scoreHint(76, 5)).toEqual({ kind: 'improvable', count: 5 });
  });
});

describe('简历基本信息栏拼装', () => {
  it('按截图 05 的顺序拼接', () => {
    expect(
      formatResumeMeta({
        full_name: '李婷',
        job_intent: '产品经理',
        years_experience: 3,
        city: '深圳',
        phone: '138****8888',
        email: 'liting@mail.com',
        avatar_url: null,
      }),
    ).toBe('产品经理 · 3 年经验 · 深圳 · liting@mail.com · 138****8888');
  });

  it('跳过空字段，不留下空洞分隔符', () => {
    expect(
      formatResumeMeta({
        full_name: '李婷',
        job_intent: '产品经理',
        years_experience: null,
        city: '',
        phone: '',
        email: 'a@b.com',
        avatar_url: null,
      }),
    ).toBe('产品经理 · a@b.com');
  });
});

describe('建议文案的高亮切分（原型的 <b> 标签）', () => {
  it('按 emphasis 切成交替片段', () => {
    expect(
      splitEmphasis('主导 2 条核心产品线运营，3 个月内推动 DAU 增长 25%', ['25%']),
    ).toEqual([
      { text: '主导 2 条核心产品线运营，3 个月内推动 DAU 增长 ', highlighted: false },
      { text: '25%', highlighted: true },
    ]);
  });

  it('支持多个强调词', () => {
    const parts = splitEmphasis('熟练使用 SQL 与 A/B 测试 支撑增长决策', [
      'SQL',
      'A/B 测试',
    ]);
    expect(parts.filter((p) => p.highlighted).map((p) => p.text)).toEqual([
      'SQL',
      'A/B 测试',
    ]);
    expect(parts.map((p) => p.text).join('')).toBe(
      '熟练使用 SQL 与 A/B 测试 支撑增长决策',
    );
  });

  it('没有强调词时原样返回', () => {
    expect(splitEmphasis('纯文本', [])).toEqual([
      { text: '纯文本', highlighted: false },
    ]);
  });

  it('强调词不存在于文本中时不产生空片段', () => {
    expect(splitEmphasis('纯文本', ['不存在'])).toEqual([
      { text: '纯文本', highlighted: false },
    ]);
  });

  it('切分后拼回原文，永不丢字', () => {
    for (const suggestion of MOCK_ANALYSIS.suggestions) {
      const parts = splitEmphasis(
        suggestion.suggested_text,
        suggestion.emphasis,
      );
      expect(parts.map((p) => p.text).join('')).toBe(suggestion.suggested_text);
    }
  });
});
