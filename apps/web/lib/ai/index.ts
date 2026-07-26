import { loadActiveProvider } from '../admin/providers';

import { CLAUDE_DEFAULT_MODEL, ClaudeAIService } from './claude';
import { MockAIService } from './mock';
import { OpenAICompatibleAIService } from './openai-compatible';
import type { AIService } from './types';

export * from './types';

let cached: AIService | null = null;

/**
 * AI_PROVIDER=claude 时真调模型，其余情况（包括未设置）走 mock。
 *
 * 默认走 mock 是有意的：没有 API Key 的人 clone 下来也能把全链路跑通，
 * CI 同理。要真调模型必须同时显式设置 AI_PROVIDER=claude 和
 * ANTHROPIC_API_KEY —— 只设一个就当作配置错误直接报出来，
 * 而不是悄悄退回 mock 让人以为模型在工作。
 */
export function getAIService(): AIService {
  if (cached) return cached;

  const provider = process.env.AI_PROVIDER ?? 'mock';

  if (provider === 'claude') {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        'AI_PROVIDER=claude 但没有设置 ANTHROPIC_API_KEY。' +
          '要么补上 key，要么把 AI_PROVIDER 设为 mock。',
      );
    }
    cached = new ClaudeAIService();
  } else {
    cached = new MockAIService();
  }

  return cached;
}

/** 测试用：换掉当前实现 */
export function setAIService(service: AIService | null): void {
  cached = service;
}

/* ------------------------------------------------------------------ */

/**
 * 装好的一次接入。platform / model 单独交出来是给埋点用的——ai_usage 冗余
 * 记下当时打的是哪个平台哪个型号，后台改了配置也不影响历史用量。
 */
export interface LoadedAIService {
  service: AIService;
  platform: string;
  model: string;
}

/**
 * 配置缓存的存活时间。
 *
 * 每次分析都去查一次 ai_providers 等于给每个请求白加一个数据库往返；
 * 完全不缓存又会让后台切换平台之后要重启才生效。30 秒是个折中——后台
 * 改完配置最多半分钟见效，改的人自己等得起。
 */
const CONFIG_TTL_MS = 30_000;

let configCache: { loaded: LoadedAIService; expiresAt: number } | null = null;

/** 后台改完接入配置后调一下，不用等 TTL 自然过期 */
export function resetConfiguredAIService(): void {
  configCache = null;
}

/**
 * 优先级：**后台 ai_providers 里启用的那条 > AI_PROVIDER 环境变量**。
 *
 * 这个方向不能反。后台存在的意义就是让不碰代码的人换平台换 key，如果
 * 环境变量能盖过它，界面上显示「已启用 DeepSeek」而实际在打 Claude，
 * 排查起来毫无线索。环境变量只是**没有后台配置时的兜底**：本地 clone、
 * CI、以及后台还没来得及配的那段时间。
 */
export async function getConfiguredAIService(): Promise<LoadedAIService> {
  if (configCache && configCache.expiresAt > Date.now()) {
    return configCache.loaded;
  }

  const loaded = await load();
  configCache = { loaded, expiresAt: Date.now() + CONFIG_TTL_MS };
  return loaded;
}

async function load(): Promise<LoadedAIService> {
  const active = await loadActiveProvider();

  if (!active) {
    // 没有后台配置，退回环境变量那套
    const service = getAIService();
    const isClaude = service instanceof ClaudeAIService;
    return {
      service,
      platform: isClaude ? 'anthropic' : 'mock',
      model: isClaude ? CLAUDE_DEFAULT_MODEL : 'mock',
    };
  }

  const service =
    active.protocol === 'anthropic'
      ? new ClaudeAIService({
          apiKey: active.apiKey,
          model: active.model,
          effort: active.effort,
        })
      : new OpenAICompatibleAIService({
          // base_url 在 openai_compatible 上有 NOT NULL 语义的 CHECK 约束，
          // 这里的 ?? '' 只是给类型收口，构造函数会再拦一次
          baseUrl: active.baseUrl ?? '',
          apiKey: active.apiKey,
          model: active.model,
          platform: active.label,
        });

  return { service, platform: active.platform, model: active.model };
}
