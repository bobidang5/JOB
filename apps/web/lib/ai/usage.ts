import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  AiCallKind,
  AiCallStatus,
  Database,
} from '../database.types';
import {
  AIContractError,
  AIRefusalError,
  AIUnsupportedInputError,
  type AICallOptions,
  type AICallUsage,
} from './types';

/**
 * 模型调用的用量埋点。
 *
 * 写的是 ai_usage —— 后台「用量」页所有数字的唯一来源。用**调用者自己的**
 * supabase 客户端（anon key + 用户 JWT），不是 service_role：ai_usage 上
 * 专门开了一条 insert 策略允许用户写自己的行，就是为了让前台路由记一条
 * 用量不必把 service_role 引进来。详见迁移文件里那一段。
 *
 * 因此这里的 user_id 不用（也不该）由调用方自证——RLS 的 with check 会把
 * 它和 JWT 里的 uid 对死，写错了数据库直接拒。
 */

export interface UsageRecord {
  userId: string;
  kind: AiCallKind;
  /** 冗余记下当时用的平台与型号，配置改了历史用量也不变形 */
  platform: string;
  model: string;
  status: AiCallStatus;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  latencyMs?: number;
  /** 失败分类，如 refusal / contract / http_429。绝不放原始报错 */
  errorCode?: string | null;
}

/**
 * 记一条用量。
 *
 * **绝不让埋点影响主流程**：整个函数包在 try/catch 里，失败只 console.error。
 * 用户的简历已经分析完了，因为一条统计写不进去就把 500 抛回去是本末倒置。
 */
export async function recordUsage(
  supabase: SupabaseClient<Database>,
  record: UsageRecord,
): Promise<void> {
  try {
    const { error } = await supabase.from('ai_usage').insert({
      user_id: record.userId,
      kind: record.kind,
      platform: record.platform,
      model: record.model,
      status: record.status,
      input_tokens: record.inputTokens ?? 0,
      output_tokens: record.outputTokens ?? 0,
      cache_read_tokens: record.cacheReadTokens ?? 0,
      latency_ms: record.latencyMs ?? 0,
      error_code: record.errorCode ?? null,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error('[ai-usage] 埋点写入失败', error);
  }
}

/**
 * 异常 → ai_call_status + error_code。
 *
 * error_code 只放粗分类：ai_usage 那一列是给后台做聚合用的，原始报错里
 * 可能夹着简历片段，进了数据库就等着被导出来（和 lib/http.ts 不把细节
 * 放进响应体是同一个理由）。
 */
export function classifyAIError(error: unknown): {
  status: AiCallStatus;
  errorCode: string;
} {
  if (error instanceof AIRefusalError) {
    return { status: 'refusal', errorCode: error.category ?? 'refusal' };
  }
  if (error instanceof AIContractError) {
    return { status: 'contract', errorCode: 'contract' };
  }
  if (error instanceof AIUnsupportedInputError) {
    return { status: 'error', errorCode: 'unsupported_input' };
  }

  // 网络层的错误名（TimeoutError / AbortError / TypeError…）本身就是分类，
  // 且不含用户数据，可以直接用
  if (error instanceof Error && error.name && error.name !== 'Error') {
    return { status: 'error', errorCode: error.name };
  }
  return { status: 'error', errorCode: 'error' };
}

export interface UsageContext {
  userId: string;
  kind: AiCallKind;
  platform: string;
  model: string;
}

/**
 * 包住一次模型调用：计时、收 token、记一条用量，然后把结果或异常原样交出去。
 *
 * 存在的意义是让三条前台路由各自只多两行，且**不改变它们的错误处理**——
 * 抛出去的还是原来那个异常对象，errorResponse 那边的分类映射一个字都不用动。
 */
export async function withUsage<T>(
  supabase: SupabaseClient<Database>,
  context: UsageContext,
  run: (options: AICallOptions) => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  let usage: AICallUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
  };

  try {
    const result = await run({
      onUsage: (reported) => {
        usage = reported;
      },
    });
    await recordUsage(supabase, {
      ...context,
      ...usage,
      status: 'ok',
      latencyMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    // 失败的调用同样计费、同样占延迟，不记就看不出「某个平台一直在报错」
    await recordUsage(supabase, {
      ...context,
      ...usage,
      ...classifyAIError(error),
      latencyMs: Date.now() - startedAt,
    });
    throw error;
  }
}
