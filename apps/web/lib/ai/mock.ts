import {
  MOCK_ANALYSIS,
  MOCK_JOB_TARGET,
  MOCK_RESUME_SAMPLE,
  formatResumeMeta,
  type AnalyzeResponse,
  type Profile,
  type ResumeContent,
  type ResumeTemplateKey,
} from '@zhiyou/shared';

import type { AIService, ResumeUpload } from './types';

/**
 * 不调模型的实现。
 *
 * 返回 packages/shared 里从原型移植过来的固定数据，逐位复现
 * DESIGN-SPEC §5.3 的「每采纳 1 条 +2 分、上限 84」。
 *
 * 三个用途：演示、没有 API Key 的本地开发、CI 里跑端到端联调。
 * 由 AI_PROVIDER=mock 选择。
 */
export class MockAIService implements AIService {
  async parseResume(upload: ResumeUpload) {
    return {
      content: MOCK_RESUME_SAMPLE,
      title: upload.filename,
    };
  }

  async analyze(input: {
    resume: ResumeContent;
    jdText: string;
    baseScore: number;
  }): Promise<AnalyzeResponse> {
    // 只保留在这份简历里真的能落地的建议，并把 original_text 换成该位置
    // 的实际原文——否则拿一份非演示简历跑时，界面上的「原文」会和用户
    // 自己的简历对不上。
    const suggestions = MOCK_ANALYSIS.suggestions
      .map((suggestion) => {
        const actual = readPath(input.resume, suggestion.field_path);
        return actual === null ? null : { ...suggestion, original_text: actual };
      })
      .filter((suggestion): suggestion is NonNullable<typeof suggestion> => !!suggestion);

    return {
      ...MOCK_ANALYSIS,
      suggestions,
      // max_score 跟着实际条数走，保持「起始分 + 2×条数」的关系
      max_score: input.baseScore + suggestions.length * 2,
      job_title: MOCK_JOB_TARGET.title,
      company: MOCK_JOB_TARGET.company,
    };
  }

  async draftFromTemplate(input: {
    profile: Profile;
    templateKey: ResumeTemplateKey;
  }): Promise<ResumeContent> {
    return {
      ...MOCK_RESUME_SAMPLE,
      name: input.profile.full_name || MOCK_RESUME_SAMPLE.name,
      meta: formatResumeMeta(input.profile),
    };
  }
}

const EXP_BULLET = /^exp\[(\d+)\]\.lis\[(\d+)\]$/;
const PROJECT_BULLET = /^projects\[(\d+)\]\.lis\[(\d+)\]$/;

/** 读出 field_path 指向的文字；位置不存在返回 null */
function readPath(resume: ResumeContent, fieldPath: string): string | null {
  if (fieldPath === 'summary') return resume.summary;
  if (fieldPath === 'skills') return resume.skills;

  const exp = EXP_BULLET.exec(fieldPath);
  if (exp) {
    return resume.exp[Number(exp[1])]?.lis[Number(exp[2])] ?? null;
  }

  const project = PROJECT_BULLET.exec(fieldPath);
  if (project) {
    return resume.projects[Number(project[1])]?.lis[Number(project[2])] ?? null;
  }

  return null;
}
