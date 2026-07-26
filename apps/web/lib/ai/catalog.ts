import type { AiProtocol } from '../database.types';

/**
 * 可接入的 AI 平台目录。
 *
 * 后台「AI 接入」页的下拉数据源，同时也是 ai_providers.platform 取值的来源。
 * 分类维度是**协议**不是厂商：除 Anthropic 外，这些平台都提供 OpenAI
 * /chat/completions 兼容端点，所以适配器只需要两个实现（见 ai_protocol 枚举）。
 *
 * 型号在这里只是「建议」，不是白名单——理由见 AIPlatform.suggestedModels。
 */

export const PLATFORM_IDS = [
  'anthropic',
  'openai',
  'gemini',
  'deepseek',
  'moonshot',
  'zhipu',
  'qwen',
  'volcengine',
  'xai',
  'mistral',
  'siliconflow',
  'custom',
] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

export interface AIPlatform {
  id: PlatformId;
  /** 后台下拉里显示的名字 */
  label: string;
  protocol: AiProtocol;
  /**
   * 默认端点。openai_compatible 的平台都给了官方地址，新建接入时直接带出来；
   * anthropic 走 SDK 的官方端点、custom 由用户自己填，这两个是空串。
   */
  defaultBaseUrl: string;
  /**
   * 下拉里的**建议**型号，不是白名单。
   *
   * ai_providers.model 是自由文本，后台表单必须允许手填任意值：各家平台
   * 几周就上一批新型号、下一批旧型号，把可选值写死在代码里等于给这个后台
   * 定了三个月的保质期。这里只负责让常见选择少打几个字。
   */
  suggestedModels: readonly string[];
  /** 填表时容易踩的坑，显示在输入框下方。没有就不显示 */
  hint?: string;
}

export const PLATFORMS: readonly AIPlatform[] = [
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    protocol: 'anthropic',
    // 空串 = 用官方 SDK 的默认端点
    defaultBaseUrl: '',
    suggestedModels: [
      'claude-opus-5',
      'claude-sonnet-5',
      'claude-fable-5',
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-haiku-4-5',
    ],
    hint: '唯一支持直接解析 PDF / 图片简历原件的接入方式。',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    suggestedModels: [
      'gpt-5',
      'gpt-5-mini',
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4o',
      'gpt-4o-mini',
      'o3',
      'o4-mini',
    ],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    suggestedModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek 深度求索',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'moonshot',
    label: '月之暗面 Kimi',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    suggestedModels: [
      'kimi-latest',
      'moonshot-v1-128k',
      'moonshot-v1-32k',
      'moonshot-v1-8k',
    ],
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    suggestedModels: ['glm-4-plus', 'glm-4-air', 'glm-4-flash'],
  },
  {
    id: 'qwen',
    label: '阿里云百炼（通义千问）',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    suggestedModels: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long'],
  },
  {
    id: 'volcengine',
    label: '火山方舟（豆包）',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    suggestedModels: ['doubao-pro-32k', 'doubao-pro-128k', 'doubao-lite-32k'],
    hint: '方舟的部分账号要求填「推理接入点 ID」（ep- 开头）而不是型号名，以控制台为准。',
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.x.ai/v1',
    suggestedModels: ['grok-4', 'grok-3', 'grok-3-mini'],
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    suggestedModels: [
      'mistral-large-latest',
      'mistral-small-latest',
      'open-mistral-nemo',
    ],
  },
  {
    id: 'siliconflow',
    label: '硅基流动',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    suggestedModels: [
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
      'Qwen/Qwen2.5-72B-Instruct',
    ],
    hint: '型号名带组织前缀，照控制台上的全称填。',
  },
  {
    id: 'custom',
    label: '自定义 OpenAI 兼容端点',
    protocol: 'openai_compatible',
    // 自建 / 中转 / vLLM 之类，地址只有用户自己知道
    defaultBaseUrl: '',
    suggestedModels: [],
    hint: '填到 /chat/completions 之前那一段，通常以 /v1 结尾。',
  },
];

/** 按 id 取平台。未知 id 返回 undefined，调用方自己决定怎么兜 */
export function getPlatform(id: string): AIPlatform | undefined {
  return PLATFORMS.find((platform) => platform.id === id);
}

/**
 * 这条记录该用哪个协议。
 *
 * 历史行的 platform 可能已经从目录里删掉了，那时按 openai_compatible 处理：
 * 目录里除 Anthropic 外全是这个协议，猜错的代价也只是报一次连接错误。
 */
export function protocolOf(platformId: string): AiProtocol {
  return getPlatform(platformId)?.protocol ?? 'openai_compatible';
}
