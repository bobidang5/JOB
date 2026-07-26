import { ClaudeAIService } from './claude';
import { MockAIService } from './mock';
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
