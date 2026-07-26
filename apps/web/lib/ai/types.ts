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

/** 一次模型调用的 token 用量，落进 ai_usage。 */
export interface AICallUsage {
  inputTokens: number;
  outputTokens: number;
  /** 命中提示词缓存的输入 token。单独记才看得出缓存有没有省到钱 */
  cacheReadTokens: number;
}

/** 三个方法都接受的可选项。 */
export interface AICallOptions {
  /**
   * 真实调用结束后回调一次，上报 token 用量。
   *
   * 做成回调而不是塞进返回值：用量是横切关注点，不该污染三个方法各自的
   * 业务契约，而且**拒答和契约错误也要能记上**——那两种情况方法是抛异常
   * 的，没有返回值可挂。
   *
   * MockAIService 不回调：它根本没调模型，记 0 只会污染后台的用量统计。
   */
  onUsage?: (usage: AICallUsage) => void;
}

/**
 * AI 能力的抽象。
 *
 * 三个实现：
 *   - MockAIService：返回原型的固定数据，逐位复现 DESIGN-SPEC §5.3 的
 *     计分规则。用于演示、离线开发和 CI（不需要 API Key）。
 *   - ClaudeAIService：真调 Claude。
 *   - OpenAICompatibleAIService：打各家的 OpenAI /chat/completions 兼容端点。
 *
 * 用哪个由后台 ai_providers 的启用项决定，没有配置时退回 AI_PROVIDER
 * 环境变量（见 index.ts）。上层路由对它们一视同仁。
 */
export interface AIService {
  /** 上传的 PDF / Word / 图片 → 结构化简历内容 */
  parseResume(
    upload: ResumeUpload,
    options?: AICallOptions,
  ): Promise<{
    content: ResumeContent;
    title: string;
  }>;

  /** 简历 + JD → 匹配度、缺失关键词、逐条改写建议 */
  analyze(
    input: {
      resume: ResumeContent;
      jdText: string;
      baseScore: number;
    },
    options?: AICallOptions,
  ): Promise<AnalyzeResponse>;

  /** 新用户从模版新建：用个人资料起草第一份简历 */
  draftFromTemplate(
    input: {
      profile: Profile;
      templateKey: ResumeTemplateKey;
    },
    options?: AICallOptions,
  ): Promise<ResumeContent>;
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

/**
 * 当前接入的平台处理不了这种输入。
 *
 * 目前只有一种情况：简历原件是 PDF 或图片，而启用的是 OpenAI 兼容接入——
 * 那些端点的 /chat/completions 只吃文本和图片 URL，没有统一的文档解析。
 * 这不是模型的错也不是用户的错，是配置选择的后果，所以单独一类：它要给
 * 用户一句「换 Anthropic 接入」的可执行提示，而不是笼统的「出了点问题」。
 */
export class AIUnsupportedInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIUnsupportedInputError';
  }
}
