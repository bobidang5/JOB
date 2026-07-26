import { ResumeContentSchema } from '@zhiyou/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AIContractError, AIRefusalError } from './ai';
import { errorResponse } from './http';
import { UnauthorizedError } from './supabase';

/**
 * errorResponse 是所有路由唯一的错误出口，它承担两件事：把异常分类映射
 * 成 HTTP 状态码，以及**拦住内部细节不进响应体**。两件都在这里钉死。
 *
 * 第二件尤其重要：模型返回和数据库报错里可能夹着用户简历的片段，
 * 泄漏出去就是隐私事故，而这种泄漏不会让任何功能测试变红。
 */

afterEach(() => {
  vi.restoreAllMocks();
});

/** errorResponse 会往 console.error 写日志，测试里静音掉并返回这个 spy。 */
function silenceLog() {
  return vi.spyOn(console, 'error').mockImplementation(() => {});
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('errorResponse 的分类映射', () => {
  it('UnauthorizedError → 401', async () => {
    const response = errorResponse(new UnauthorizedError('缺少 Authorization 头'));

    expect(response.status).toBe(401);
    expect(await bodyOf(response)).toEqual({
      error: 'unauthorized',
      // 未登录的原因对客户端有用（是没带头还是 token 过期），且不含敏感信息
      message: '缺少 Authorization 头',
    });
  });

  it('ZodError → 400，并带上 issues', async () => {
    // 刻意用 packages/shared 的 schema 而不是本地新建一个：这同时验证了
    // 跨 workspace 只有一份 zod。真装成两份的话 instanceof ZodError 会
    // 失配，请求参数错误会被当成内部错误报 500——只有这样测才看得出来。
    let caught: unknown;
    try {
      ResumeContentSchema.parse({ name: 42 });
    } catch (error) {
      caught = error;
    }

    const response = errorResponse(caught);
    const body = await bodyOf(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('invalid_request');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('AIRefusalError → 422，category 只进日志不进响应体', async () => {
    const log = silenceLog();

    const response = errorResponse(new AIRefusalError('self_harm'));
    const body = await bodyOf(response);

    expect(response.status).toBe(422);
    expect(body).toEqual({ error: 'ai_refused', message: '这次内容没能处理，换一份试试' });
    expect(JSON.stringify(body)).not.toContain('self_harm');
    expect(log).toHaveBeenCalled();
  });

  it('AIContractError → 502，模型原始返回不进响应体', async () => {
    const log = silenceLog();
    // 契约错误的 message 里通常带着模型吐回来的片段，而那片段可能是
    // 用户简历的内容
    const leak = 'suggestions[0] 缺 field_path：李婷 138****8888';

    const response = errorResponse(new AIContractError(leak));
    const body = await bodyOf(response);

    expect(response.status).toBe(502);
    expect(body).toEqual({ error: 'ai_contract', message: '分析结果异常，请再试一次' });
    expect(JSON.stringify(body)).not.toContain('李婷');
    expect(log).toHaveBeenCalled();
  });

  it('其它异常 → 500，原始 message 不进响应体', async () => {
    const log = silenceLog();
    const leak = 'connect ECONNREFUSED postgres://postgres:secret@127.0.0.1:54322';

    const response = errorResponse(new Error(leak));
    const body = await bodyOf(response);

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'internal', message: '出了点问题，请再试一次' });
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(log).toHaveBeenCalled();
  });

  it('非 Error 的抛出物也归到 500，不会自己再抛一次', async () => {
    silenceLog();

    // throw '字符串' / throw undefined 都是合法的 JS，错误出口不能假设
    // 拿到的一定是 Error 实例
    for (const thrown of ['坏了', undefined, null, { code: 42 }]) {
      const response = errorResponse(thrown);
      expect(response.status).toBe(500);
      expect((await bodyOf(response)).error).toBe('internal');
    }
  });
});
