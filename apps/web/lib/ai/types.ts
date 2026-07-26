import type {
  AnalyzeResponse,
  Profile,
  ResumeContent,
  ResumeTemplateKey,
} from '@zhiyou/shared';

/** 上传的简历原件 */
export interface ResumeUpload {
  filename: string;
  /** application/pdf | image/* | .docx 的 MIME */
  mediaType: string;
  data: Buffer;
}

/**
 * AI 能力的抽象。
 *
 * 两个实现：
 *   - MockAIService：返回原型的固定数据，逐位复现 DESIGN-SPEC §5.3 的
 *     计分规则。用于演示、离线开发和 CI（不需要 API Key）。
 *   - ClaudeAIService：真调 Claude。
 *
 * 由 AI_PROVIDER 环境变量选择。上层路由对两者一视同仁。
 */
export interface AIService {
  /** 上传的 PDF / Word / 图片 → 结构化简历内容 */
  parseResume(upload: ResumeUpload): Promise<{
    content: ResumeContent;
    title: string;
  }>;

  /** 简历 + JD → 匹配度、缺失关键词、逐条改写建议 */
  analyze(input: {
    resume: ResumeContent;
    jdText: string;
    baseScore: number;
  }): Promise<AnalyzeResponse>;

  /** 新用户从模版新建：用个人资料起草第一份简历 */
  draftFromTemplate(input: {
    profile: Profile;
    templateKey: ResumeTemplateKey;
  }): Promise<ResumeContent>;
}

/** 模型拒答。安全分类器可能对某些内容拒绝作答，这不是网络错误。 */
export class AIRefusalError extends Error {
  constructor(readonly category: string | null) {
    super('模型拒绝处理这次请求');
    this.name = 'AIRefusalError';
  }
}

/** 模型返回的 JSON 不符合契约。 */
export class AIContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIContractError';
  }
}
