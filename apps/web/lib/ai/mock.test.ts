import {
  AnalyzeResponseSchema,
  FieldPathSchema,
  MOCK_ANALYSIS,
  MOCK_BASE_SCORE,
  MOCK_JD_TEXT,
  MOCK_PROFILE,
  MOCK_RESUME_BEFORE,
  MOCK_RESUME_SAMPLE,
  ParseResumeResponseSchema,
  ResumeContentSchema,
  applySuggestion,
  computeScoreAfter,
  formatResumeMeta,
} from '@zhiyou/shared';
import { describe, expect, it } from 'vitest';

import { MockAIService } from './mock';

/**
 * mock provider 的产出会原样写进数据库、再驱动界面，所以它必须满足和
 * 真模型完全相同的契约。这里守住的核心不变量是 field_path：
 *
 *   1. 过得了 FieldPathSchema 白名单（它是防止动态属性写入的那道闸）；
 *   2. 在目标简历上真的落得下去。
 *
 * 只满足 1 不满足 2 的建议会在 apply 阶段被静默跳过，界面上分数照加、
 * 简历没变——这种 bug 不会抛异常，只能靠断言 2 抓。
 */

const ai = new MockAIService();

const analyzeBefore = () =>
  ai.analyze({
    resume: MOCK_RESUME_BEFORE,
    jdText: MOCK_JD_TEXT,
    baseScore: MOCK_BASE_SCORE,
  });

describe('MockAIService.analyze', () => {
  it('返回值符合 AnalyzeResponseSchema', async () => {
    const result = await analyzeBefore();

    expect(AnalyzeResponseSchema.safeParse(result).success).toBe(true);
  });

  it('每条建议的 field_path 都被 FieldPathSchema 接受', async () => {
    const { suggestions } = await analyzeBefore();

    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(
        FieldPathSchema.safeParse(suggestion.field_path).success,
        `field_path 不合法：${suggestion.field_path}`,
      ).toBe(true);
    }
  });

  it('每条 field_path 都能在 MOCK_RESUME_BEFORE 上解析', async () => {
    const { suggestions } = await analyzeBefore();

    for (const suggestion of suggestions) {
      // 用生产代码里真正的写入器判断「解析得到」，而不是另写一份正则
      const { applied } = applySuggestion(
        MOCK_RESUME_BEFORE,
        suggestion.field_path,
        '探针',
      );
      expect(applied, `field_path 落不下去：${suggestion.field_path}`).toBe(true);
    }
  });

  it('固定数据 MOCK_ANALYSIS 本身也全部合法', () => {
    // provider 会过滤掉落不下去的条目，所以上面几条断言即便固定数据里
    // 混进了非法 field_path 也可能是绿的。这里直接检查未过滤的源头。
    for (const suggestion of MOCK_ANALYSIS.suggestions) {
      expect(
        FieldPathSchema.safeParse(suggestion.field_path).success,
        `field_path 不合法：${suggestion.field_path}`,
      ).toBe(true);
    }
  });

  it('MOCK_RESUME_BEFORE 上四条建议全部落地', async () => {
    const { suggestions } = await analyzeBefore();

    expect(suggestions).toHaveLength(MOCK_ANALYSIS.suggestions.length);
  });

  it('original_text 换成了简历里该位置的实际原文', async () => {
    const { suggestions } = await analyzeBefore();
    const summary = suggestions.find((s) => s.field_path === 'summary');

    // 固定数据的 original_text 恰好等于 MOCK_RESUME_BEFORE 的原文，
    // 所以这里同时验证了替换逻辑没把它改坏
    expect(summary?.original_text).toBe(MOCK_RESUME_BEFORE.summary);
  });

  it('落不下去的建议被丢掉，max_score 跟着实际条数走', async () => {
    // MOCK_RESUME_SAMPLE 的 projects 是空的，projects[0].lis[0] 那条无处安放
    const result = await ai.analyze({
      resume: MOCK_RESUME_SAMPLE,
      jdText: MOCK_JD_TEXT,
      baseScore: MOCK_BASE_SCORE,
    });

    expect(result.suggestions.length).toBe(MOCK_ANALYSIS.suggestions.length - 1);
    expect(result.suggestions.some((s) => s.field_path.startsWith('projects'))).toBe(
      false,
    );

    // DESIGN-SPEC §5.3：起始分 + 2×条数，全部采纳后正好顶到 max_score
    expect(result.max_score).toBe(MOCK_BASE_SCORE + result.suggestions.length * 2);
    expect(
      computeScoreAfter(MOCK_BASE_SCORE, result.suggestions, result.max_score),
    ).toBe(result.max_score);
  });
});

describe('MockAIService 的另外两个方法', () => {
  it('parseResume 返回示例简历，标题取上传文件名', async () => {
    const result = await ai.parseResume({
      filename: '产品经理-李婷.pdf',
      mediaType: 'application/pdf',
      data: Buffer.from('%PDF-1.4'),
    });

    expect(ParseResumeResponseSchema.safeParse(result).success).toBe(true);
    expect(result.title).toBe('产品经理-李婷.pdf');
  });

  it('draftFromTemplate 用个人资料填姓名与基本信息栏', async () => {
    const content = await ai.draftFromTemplate({
      profile: MOCK_PROFILE,
      templateKey: 'v1',
    });

    expect(ResumeContentSchema.safeParse(content).success).toBe(true);
    expect(content.name).toBe(MOCK_PROFILE.full_name);
    expect(content.meta).toBe(formatResumeMeta(MOCK_PROFILE));
  });
});
