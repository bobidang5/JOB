import Anthropic from '@anthropic-ai/sdk';
import {
  AnalyzeResponseSchema,
  ParseResumeResponseSchema,
  ResumeContentSchema,
  formatResumeMeta,
  type AnalyzeResponse,
  type Profile,
  type ResumeContent,
  type ResumeTemplateKey,
} from '@zhiyou/shared';

import {
  ANALYZE_SCHEMA,
  ANALYZE_SYSTEM,
  DRAFT_SCHEMA,
  DRAFT_SYSTEM,
  PARSE_SCHEMA,
  PARSE_SYSTEM,
} from './prompts';
import {
  AIContractError,
  AIRefusalError,
  type AICallOptions,
  type AIService,
  type ResumeUpload,
} from './types';

export const CLAUDE_DEFAULT_MODEL = 'claude-opus-5';

/** 服务端拒答兜底的 beta 标志（scalar "default" 形式对应这个日期） */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

type JsonSchema = Record<string, unknown>;

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

interface CallOptions {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: JsonSchema;
  /** 抽取类任务用 medium，真正吃智能的分析用 high */
  effort: Effort;
  maxTokens: number;
}

export interface ClaudeConfig {
  /** 不传则由 SDK 读 ANTHROPIC_API_KEY */
  apiKey?: string;
  model?: string;
  /**
   * analyze 用的 effort。抽取类任务（parse / draft）不跟这个走——
   * 它们不吃深度推理，调高只是白烧 token 和延迟。
   */
  effort?: Effort;
  /** 测试用：直接塞一个客户端进来 */
  client?: Anthropic;
}

export class ClaudeAIService implements AIService {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly analyzeEffort: Effort;

  constructor(config: ClaudeConfig = {}) {
    this.client =
      config.client ??
      new Anthropic(config.apiKey ? { apiKey: config.apiKey } : {});
    this.model = config.model ?? CLAUDE_DEFAULT_MODEL;
    this.analyzeEffort = config.effort ?? 'high';
  }

  /**
   * 一次带结构化输出的调用。
   *
   * 为什么必须流式：Opus 5 默认开启 adaptive thinking，thinking 与正文
   * 共用 max_tokens，在这个量级下非流式请求有 HTTP 超时风险。
   *
   * 系统提示词加了 cache_control —— 它每次调用完全一致，缓存后重复请求
   * 只按缓存读计费。
   */
  private async call<T>(
    { system, content, schema, effort, maxTokens }: CallOptions,
    options?: AICallOptions,
  ): Promise<T> {
    const params = {
      model: this.model,
      max_tokens: maxTokens,
      system: [
        {
          type: 'text' as const,
          text: system,
          cache_control: { type: 'ephemeral' as const },
        },
      ],
      output_config: {
        effort,
        format: { type: 'json_schema' as const, schema },
      },
      messages: [{ role: 'user' as const, content }],
    };

    let message: Anthropic.Beta.BetaMessage;
    try {
      // 默认开启服务端兜底：分类器拒答时由兜底模型在同一次调用里接手。
      const stream = this.client.beta.messages.stream({
        ...params,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
      } as unknown as Anthropic.Beta.MessageCreateParamsStreaming);
      message = await stream.finalMessage();
    } catch (error) {
      // 兜底参数还没在所有账号上放开时会被拒；简历内容本来也极少触发
      // 拒答，所以退回不带兜底的调用，下面的 refusal 守卫依然生效。
      if (!isBetaRejection(error)) throw error;
      const stream = this.client.beta.messages.stream(
        params as unknown as Anthropic.Beta.MessageCreateParamsStreaming,
      );
      message = await stream.finalMessage();
    }

    // 用量在读内容之前上报：拒答和契约错误都要能记上，那两条路径是抛异常的
    options?.onUsage?.({
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    });

    // 拒答走的是 HTTP 200 + stop_reason，直接索引 content[0] 会崩，
    // 所以先判 stop_reason 再读内容。
    if (message.stop_reason === 'refusal') {
      throw new AIRefusalError(message.stop_details?.category ?? null);
    }

    const text = message.content.find(
      (block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text',
    )?.text;
    if (!text) {
      throw new AIContractError('模型没有返回文本内容');
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new AIContractError('模型返回的不是合法 JSON');
    }
  }

  async parseResume(upload: ResumeUpload, options?: AICallOptions) {
    const raw = await this.call<unknown>(
      {
        system: PARSE_SYSTEM,
        content: [
          toDocumentBlock(upload),
          {
            type: 'text',
            text: `请从这份简历（原文件名：${upload.filename}）里抽取结构化内容。`,
          },
        ],
        schema: PARSE_SCHEMA,
        // 抽取任务不吃深度推理，medium 足够且更省 token 与延迟
        effort: 'medium',
        maxTokens: 16000,
      },
      options,
    );

    const parsed = ParseResumeResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AIContractError(`解析结果不符合契约：${parsed.error.message}`);
    }
    return parsed.data;
  }

  async analyze(
    input: {
      resume: ResumeContent;
      jdText: string;
      baseScore: number;
    },
    options?: AICallOptions,
  ): Promise<AnalyzeResponse> {
    const raw = await this.call<unknown>(
      {
        system: ANALYZE_SYSTEM,
        content: [
          {
            type: 'text',
            text:
              `简历（JSON）：\n${JSON.stringify(input.resume, null, 2)}\n\n` +
              `当前简历分：${input.baseScore}\n\n` +
              `职位描述：\n${input.jdText}`,
          },
        ],
        schema: ANALYZE_SCHEMA,
        // 全 App 唯一真正吃智能的环节
        effort: this.analyzeEffort,
        maxTokens: 32000,
      },
      options,
    );

    const parsed = AnalyzeResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AIContractError(`分析结果不符合契约：${parsed.error.message}`);
    }

    // field_path 已由 Zod 校验形式，这里再确认下标真的存在——模型可能
    // 引用一条它自己想象出来的经历，那样采纳时会静默不生效。
    const suggestions = parsed.data.suggestions.filter((suggestion) =>
      pathResolves(input.resume, suggestion.field_path),
    );

    return { ...parsed.data, suggestions };
  }

  async draftFromTemplate(
    input: {
      profile: Profile;
      templateKey: ResumeTemplateKey;
    },
    options?: AICallOptions,
  ): Promise<ResumeContent> {
    const raw = await this.call<unknown>(
      {
        system: DRAFT_SYSTEM,
        content: [
          {
            type: 'text',
            text:
              `姓名：${input.profile.full_name}\n` +
              `求职意向：${input.profile.job_intent}\n` +
              `工作年限：${input.profile.years_experience ?? '未填'}\n` +
              `所在城市：${input.profile.city}\n` +
              `基本信息栏应为：${formatResumeMeta(input.profile)}`,
          },
        ],
        schema: DRAFT_SCHEMA,
        effort: 'medium',
        maxTokens: 16000,
      },
      options,
    );

    const parsed = ResumeContentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AIContractError(`起草结果不符合契约：${parsed.error.message}`);
    }
    return parsed.data;
  }
}

/* ------------------------------------------------------------------ */

function toDocumentBlock(upload: ResumeUpload): Anthropic.Beta.BetaContentBlockParam {
  const data = upload.data.toString('base64');

  if (upload.mediaType === 'application/pdf') {
    // PDF 原生支持，不需要 beta header
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data },
    };
  }

  if (upload.mediaType.startsWith('image/')) {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: upload.mediaType as 'image/jpeg' | 'image/png' | 'image/webp',
        data,
      },
    };
  }

  // Word 由调用方先用 mammoth 转成纯文本再进来
  return { type: 'text', text: upload.data.toString('utf8') };
}

const EXP_BULLET = /^exp\[(\d+)\]\.lis\[(\d+)\]$/;
const PROJECT_BULLET = /^projects\[(\d+)\]\.lis\[(\d+)\]$/;

/** field_path 指向的位置在这份简历里是否真的存在 */
function pathResolves(resume: ResumeContent, fieldPath: string): boolean {
  if (fieldPath === 'summary' || fieldPath === 'skills') return true;

  const exp = EXP_BULLET.exec(fieldPath);
  if (exp) {
    const entry = resume.exp[Number(exp[1])];
    return !!entry && Number(exp[2]) < entry.lis.length;
  }

  const project = PROJECT_BULLET.exec(fieldPath);
  if (project) {
    const entry = resume.projects[Number(project[1])];
    return !!entry && Number(project[2]) < entry.lis.length;
  }

  return false;
}

/** 判断错误是不是「这个 beta / 参数组合不被接受」 */
function isBetaRejection(error: unknown): boolean {
  if (!(error instanceof Anthropic.APIError)) return false;
  if (error.status !== 400 && error.status !== 404) return false;
  const message = String(error.message).toLowerCase();
  return (
    message.includes('fallback') ||
    message.includes('beta') ||
    message.includes('unexpected')
  );
}
