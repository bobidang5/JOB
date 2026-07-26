import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { AIContractError, AIRefusalError, AIUnsupportedInputError } from './ai';
import { UnauthorizedError } from './supabase';

/**
 * 统一的错误出口。
 *
 * 对客户端只吐分类和一句人话，具体的模型返回、数据库报错留在服务端日志里
 * ——那些内容可能带着用户简历的片段，不该出现在响应体里。
 */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json(
      { error: 'unauthorized', message: error.message },
      { status: 401 },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: 'invalid_request', message: '请求参数不合法', issues: error.issues },
      { status: 400 },
    );
  }

  if (error instanceof AIRefusalError) {
    console.error('[ai] refusal', { category: error.category });
    return NextResponse.json(
      { error: 'ai_refused', message: '这次内容没能处理，换一份试试' },
      { status: 422 },
    );
  }

  // 这一类的 message 是唯一可以原样回传的：它讲的是「当前接入的平台不支持
  // 这种文件」，跟用户简历的内容无关，而且用户得知道该怎么办（换 Word 传，
  // 或者让管理员把接入切回 Anthropic）。
  if (error instanceof AIUnsupportedInputError) {
    return NextResponse.json(
      { error: 'ai_unsupported_input', message: error.message },
      { status: 415 },
    );
  }

  if (error instanceof AIContractError) {
    console.error('[ai] contract', error.message);
    return NextResponse.json(
      { error: 'ai_contract', message: '分析结果异常，请再试一次' },
      { status: 502 },
    );
  }

  console.error('[api] unhandled', error);
  return NextResponse.json(
    { error: 'internal', message: '出了点问题，请再试一次' },
    { status: 500 },
  );
}

/**
 * Supabase 查询报错时抛出去，交给 errorResponse 统一处理。
 *
 * 两个签名细节都不是随手写的：
 *
 * `data: T` 不能写成 `data: T | null`。supabase-js 的响应本来就是
 * `{data: Row, error: null} | {data: null, error: PostgrestError}` 的联合，
 * null 已经在里面了。多写一个 `| null`，在
 * `unwrap(await supabase.from(...).select(...).single(), '…')` 这种把 await
 * 直接内联进参数的写法下，这个上下文类型会顺着 await 灌回 PostgrestBuilder
 * 的泛型 `then<TResult1, TResult2>`，推断塌成 T = never——于是每个字段访问
 * 都报「Property 'x' does not exist on type 'never'」。去掉之后 T 推成
 * `Row | null`，正常。
 *
 * 返回 `NonNullable<T>` 把 null 摘掉，免得每个调用点再判一次空。
 */
export function unwrap<T>(
  result: { data: T; error: { message: string } | null },
  notFoundMessage: string,
): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null || result.data === undefined) {
    throw new Error(notFoundMessage);
  }
  return result.data as NonNullable<T>;
}
