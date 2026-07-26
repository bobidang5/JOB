import {
  AnalyzeResponseSchema,
  ParseResumeResponseSchema,
  ResumeContentSchema,
  applySuggestion,
  formatResumeMeta,
  type AnalyzeResponse,
  type Profile,
  type ResumeContent,
  type ResumeTemplateKey,
} from '@zhiyou/shared';

import {
  NO_REDIRECT,
  assertUpstreamUrlAllowed,
  isRedirect,
} from '../upstream-url';
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
  AIUnsupportedInputError,
  type AICallOptions,
  type AICallUsage,
  type AIService,
  type ResumeUpload,
} from './types';

/**
 * OpenAI /chat/completions 兼容端点的适配器。
 *
 * 一个实现覆盖 catalog.ts 里除 Anthropic 外的全部平台——它们都提供了这套
 * 接口，差别只在 base_url 和型号名。
 *
 * 直接用 fetch 而不装 openai SDK：这里只用到一个 POST、两个响应字段，
 * SDK 带来的重试/流式/类型体操都用不上，而各家兼容端点对 SDK 里那些
 * 边角参数的支持程度参差不齐，少一层抽象反而更好排查。
 *
 * 提示词与 JSON Schema 直接复用 prompts.ts —— 换平台不该换契约，否则
 * 「哪家模型效果好」就没法比了。
 */

const DEFAULT_TIMEOUT_MS = 120_000;

export interface OpenAICompatibleConfig {
  /** 到 /chat/completions 之前那一段，如 https://api.deepseek.com/v1 */
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 仅用于错误信息里指名道姓，不参与请求 */
  platform?: string;
  timeoutMs?: number;
}

/**
 * 单次请求的形态。两个字段都是「降级开关」，初始都取最优解，
 * 被端点用 400 拒绝后才往下退（见 degrade）。
 */
interface RequestShape {
  /** true = response_format 用 json_schema；false = 退到 json_object */
  jsonSchema: boolean;
  /** 输出长度上限用哪个字段名 */
  tokenLimitField: 'max_tokens' | 'max_completion_tokens';
}

const INITIAL_SHAPE: RequestShape = {
  jsonSchema: true,
  tokenLimitField: 'max_tokens',
};

interface CallInput {
  system: string;
  user: string;
  /** json_schema 模式下的 schema 名，只能用 [a-zA-Z0-9_-] */
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}

export class OpenAICompatibleAIService implements AIService {
  private readonly config: OpenAICompatibleConfig;

  /**
   * 已经确认过的降级形态，进程内记住。
   *
   * 同一个端点的能力不会在两次请求之间变化，第一次探出来之后就没必要
   * 每次都先撞一遍 400 —— 那等于给每次分析平白加一个 RTT。
   */
  private shape: RequestShape = INITIAL_SHAPE;

  constructor(config: OpenAICompatibleConfig) {
    if (!config.baseUrl) throw new Error('OpenAI 兼容接入缺少 base_url');
    if (!config.apiKey) throw new Error('OpenAI 兼容接入缺少 API Key');
    if (!config.model) throw new Error('OpenAI 兼容接入缺少型号');
    this.config = config;
  }

  /* ---------------- AIService ---------------- */

  async parseResume(upload: ResumeUpload, options?: AICallOptions) {
    const text = toPlainText(upload, this.config.platform);

    const raw = await this.call({
      system: PARSE_SYSTEM,
      user:
        `简历原文（文件名：${upload.filename}）：\n\n${text}`.trim(),
      schemaName: 'parse_resume',
      schema: PARSE_SCHEMA,
      maxTokens: 16000,
    }, options);

    const parsed = ParseResumeResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AIContractError(`解析结果不符合契约：${parsed.error.message}`);
    }
    return parsed.data;
  }

  async analyze(
    input: { resume: ResumeContent; jdText: string; baseScore: number },
    options?: AICallOptions,
  ): Promise<AnalyzeResponse> {
    const raw = await this.call({
      system: ANALYZE_SYSTEM,
      user:
        `简历（JSON）：\n${JSON.stringify(input.resume, null, 2)}\n\n` +
        `当前简历分：${input.baseScore}\n\n` +
        `职位描述：\n${input.jdText}`,
      schemaName: 'analyze_resume',
      schema: ANALYZE_SCHEMA,
      maxTokens: 32000,
    }, options);

    const parsed = AnalyzeResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AIContractError(`分析结果不符合契约：${parsed.error.message}`);
    }

    // 和 Claude 那边同一道守卫：模型可能引用一条它自己想象出来的经历，
    // 那样的建议在 apply 阶段会被静默跳过，分数照加、简历没变。
    // 用生产代码里真正的写入器判断落不落得下去，不另写一份路径解析。
    const suggestions = parsed.data.suggestions.filter(
      (suggestion) =>
        applySuggestion(input.resume, suggestion.field_path, '探针').applied,
    );

    return { ...parsed.data, suggestions };
  }

  async draftFromTemplate(
    input: { profile: Profile; templateKey: ResumeTemplateKey },
    options?: AICallOptions,
  ): Promise<ResumeContent> {
    const raw = await this.call({
      system: DRAFT_SYSTEM,
      user:
        `姓名：${input.profile.full_name}\n` +
        `求职意向：${input.profile.job_intent}\n` +
        `工作年限：${input.profile.years_experience ?? '未填'}\n` +
        `所在城市：${input.profile.city}\n` +
        `基本信息栏应为：${formatResumeMeta(input.profile)}`,
      schemaName: 'draft_resume',
      schema: DRAFT_SCHEMA,
      maxTokens: 16000,
    }, options);

    const parsed = ResumeContentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AIContractError(`起草结果不符合契约：${parsed.error.message}`);
    }
    return parsed.data;
  }

  /* ---------------- 内部 ---------------- */

  /**
   * 一次带结构化输出的调用，必要时逐级降级后重试。
   *
   * 降级是这个适配器存在的主要复杂度来源，原因很实际：「OpenAI 兼容」是
   * 一个没有一致性保证的说法，各家实现的子集不同。与其为每个平台维护一张
   * 能力表（型号一更新就过期），不如让端点自己用 400 告诉我们它不支持什么，
   * 探到一次就记住（this.shape），后续请求直接用降级后的形态。
   */
  private async call(
    input: CallInput,
    options?: AICallOptions,
  ): Promise<unknown> {
    const attempted = new Set<string>();
    let shape = this.shape;

    /*
     * base_url 是后台里手填的，服务端会带着明文 API Key 打过去——所以每次
     * 调用前都要确认它没指向内网（SSRF + 密钥外带，详见 lib/upstream-url.ts）。
     *
     * 写入时已经拦过一道，这里仍然查：那道是纯字符串判断，看不出「合法域名
     * 解析到 127.0.0.1」；而且库里可能存着防护加上之前写进去的旧行。
     */
    await assertUpstreamUrlAllowed(this.config.baseUrl);

    for (;;) {
      const response = await this.post(input, shape);

      // redirect: 'manual' 之后 3xx 会原样回来。跟过去等于让上游把请求
      // （连同 Authorization 头）指到任意地址，上面那道检查就白做了
      if (isRedirect(response)) {
        throw new Error(
          `${this.config.platform ?? 'AI 平台'} 返回了重定向（HTTP ${response.status}）：` +
            '不会跟随，请在后台把接口地址改成最终地址',
        );
      }

      if (response.ok) {
        // 只有真的成功了才把形态记下来。降级本身是猜的（见 degrade），
        // 猜错时不该让一次「型号名填错」的 400 把这个实例永久钉在
        // json_object 上——那会悄悄丢掉结构化输出的保证。
        this.shape = shape;

        const body = (await response.json()) as ChatCompletion;
        // 用量在读内容之前上报：拒答和契约错误一样要记上，而那两条路径
        // 是抛异常的，没有返回值可挂
        options?.onUsage?.(readUsage(body));
        return parseJsonPayload(readContent(body));
      }

      const detail = await response.text().catch(() => '');
      const next = degrade(shape, response.status, detail, attempted);

      if (!next) {
        throw new Error(
          `${this.config.platform ?? 'AI 平台'} 返回 ${response.status}：` +
            truncate(detail, 300),
        );
      }

      attempted.add(next.reason);
      shape = next.shape;
    }
  }

  private async post(
    input: CallInput,
    shape: RequestShape,
  ): Promise<Response> {
    // json_object 模式下端点不再按 schema 约束输出，只能把 schema 写进
    // system 里当口头约定——所以降级之后契约校验（Zod）才是唯一的兜底。
    const system = shape.jsonSchema
      ? input.system
      : `${input.system}\n\n输出必须是严格符合下面这份 JSON Schema 的 JSON 对象，` +
        `不要包裹代码块、不要输出任何解释文字：\n${JSON.stringify(input.schema)}`;

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: input.user },
      ],
      [shape.tokenLimitField]: input.maxTokens,
      response_format: shape.jsonSchema
        ? {
            type: 'json_schema',
            json_schema: {
              name: input.schemaName,
              schema: input.schema,
              strict: true,
            },
          }
        : { type: 'json_object' },
    };

    const signal = AbortSignal.timeout(
      this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    return fetch(`${trimSlash(this.config.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
      redirect: NO_REDIRECT,
    });
  }
}

/* ------------------------------------------------------------------ */

interface Degradation {
  reason: string;
  shape: RequestShape;
}

/**
 * 这个 400 是不是「换个写法就能过」，能就给出下一个形态。
 *
 * 两条已知的不兼容：
 *
 *   1. response_format: json_schema —— 只有一部分端点实现了它。不支持的
 *      会以 400 拒掉整个请求，而不是忽略这个字段。退到 json_object，
 *      并把 schema 塞进 system 当口头约定。
 *   2. max_tokens —— OpenAI 的新型号（o 系列、gpt-5 等）改用
 *      max_completion_tokens，继续发 max_tokens 会被 400 直接拒。
 *
 * 第 2 条能从报错文案里认出来（那句话里一定带着新字段名），第 1 条**不能**
 * 假设报错文案有用：不少兼容端点对不认识的字段只回一句「Invalid request」。
 * 所以 json_schema 的降级是无条件的——只要是 400 且还没试过，就退一档再打
 * 一次。代价是配置真填错时多一个请求，换来的是不必为每家平台维护一张
 * 「支不支持结构化输出」的表（那种表一定会过期）。
 *
 * 每种降级一次性：attempted 记下试过的，两条加起来最多重试两次。
 */
function degrade(
  shape: RequestShape,
  status: number,
  detail: string,
  attempted: Set<string>,
): Degradation | null {
  if (status !== 400 && status !== 422) return null;

  if (
    shape.tokenLimitField === 'max_tokens' &&
    !attempted.has('token_limit_field') &&
    detail.toLowerCase().includes('max_completion_tokens')
  ) {
    return {
      reason: 'token_limit_field',
      shape: { ...shape, tokenLimitField: 'max_completion_tokens' },
    };
  }

  if (shape.jsonSchema && !attempted.has('json_schema')) {
    return { reason: 'json_schema', shape: { ...shape, jsonSchema: false } };
  }

  return null;
}

/** 只取这个适配器真正用到的字段，其余一概不碰 */
interface ChatCompletion {
  choices?: {
    finish_reason?: string | null;
    message?: { content?: string | null; refusal?: string | null } | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number } | null;
    /** DeepSeek 用的字段名 */
    prompt_cache_hit_tokens?: number;
  } | null;
}

function readContent(data: ChatCompletion): string {
  const choice = data.choices?.[0];

  if (!choice) throw new AIContractError('模型没有返回任何 choice');

  // 结构化输出模式下模型拒答会走 message.refusal（HTTP 200），
  // 内容分类器拦下则是 finish_reason=content_filter。两者都不是网络错误。
  if (choice.message?.refusal) {
    throw new AIRefusalError(choice.message.refusal);
  }
  if (choice.finish_reason === 'content_filter') {
    throw new AIRefusalError('content_filter');
  }

  // 输出被 max_tokens 截断时 JSON 一定是残缺的，与其让 JSON.parse 抛一句
  // 「不是合法 JSON」误导排查，不如直接说清楚是截断
  if (choice.finish_reason === 'length') {
    throw new AIContractError('模型输出超出长度上限被截断');
  }

  const text = choice.message?.content;
  if (!text) throw new AIContractError('模型没有返回文本内容');

  return text;
}

function readUsage(data: ChatCompletion): AICallUsage {
  return {
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    // 两种写法都认：OpenAI 放在 prompt_tokens_details.cached_tokens，
    // DeepSeek 用扁平的 prompt_cache_hit_tokens
    cacheReadTokens:
      data.usage?.prompt_tokens_details?.cached_tokens ??
      data.usage?.prompt_cache_hit_tokens ??
      0,
  };
}

function parseJsonPayload(text: string): unknown {
  try {
    return JSON.parse(stripCodeFence(text));
  } catch {
    throw new AIContractError('模型返回的不是合法 JSON');
  }
}

/**
 * 剥掉 ```json 围栏。
 *
 * json_schema 模式下不会出现，但降级到 json_object 之后「只输出 JSON」
 * 就只是提示词里的一句话了，不少模型仍然习惯性地包一层代码块。
 */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
}

/**
 * 简历原件 → 纯文本。
 *
 * PDF 与图片在这里是**真的不支持**，不做假装：/chat/completions 没有统一的
 * 文档块，图片虽然有 image_url，但各家对它的可用性、尺寸限制和 OCR 质量
 * 差异极大，拿它去解析简历排版会得到一份似是而非的结构化数据——那比直接
 * 报错糟得多，因为用户不会发现内容错了。
 *
 * .docx 不受影响：路由层已经用 mammoth 转成了纯文本再进来。
 */
function toPlainText(upload: ResumeUpload, platform?: string): string {
  const isPdf = upload.mediaType === 'application/pdf';
  const isImage = upload.mediaType.startsWith('image/');

  if (isPdf || isImage) {
    throw new AIUnsupportedInputError(
      `当前接入的${platform ? `「${platform}」` : ''}平台走的是 OpenAI 兼容端点，` +
        `解析不了 ${isPdf ? 'PDF' : '图片'} 简历原件。` +
        '请改用 Word（.docx）上传，或在后台把 AI 接入切换成 Anthropic Claude。',
    );
  }

  const text = upload.data.toString('utf8').trim();
  if (!text) throw new AIUnsupportedInputError('这份简历里没有可读的文本内容');
  return text;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
