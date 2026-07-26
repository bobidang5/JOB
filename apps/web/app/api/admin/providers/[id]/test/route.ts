import { NextResponse } from 'next/server';

import { clientIp, writeAudit } from '../../../../../../lib/admin/audit';
import { adminDb } from '../../../../../../lib/admin/db';
import { testProviderConnectivity } from '../../../../../../lib/admin/provider-test';
import {
  PROVIDER_PUBLIC_COLUMNS,
  toProviderView,
} from '../../../../../../lib/admin/provider-view';
import { decryptSecret } from '../../../../../../lib/admin/secrets';
import {
  readAdminSession,
  unauthorizedResponse,
} from '../../../../../../lib/admin/session';
import { errorResponse } from '../../../../../../lib/http';

/**
 * POST /api/admin/providers/[id]/test —— 连通性测试。
 *
 * 用这条配置真发一次最小请求（15 秒超时），把结论写回
 * last_tested_at / last_test_ok / last_test_error。
 *
 * 这是整个后台**唯一**读 api_key_cipher 的地方。解出来的明文只在这个函数的
 * 栈上活到 testProviderConnectivity() 返回为止：既不进响应体，也不进审计，
 * 更不写回数据库。last_test_error 存的是 provider-test.ts 里那几句固定文案，
 * 上游响应体一个字节都不会落库——那里面可能带着 key 的片段。
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await readAdminSession();
    if (!session) return unauthorizedResponse();

    const { id } = await params;
    const ip = clientIp(request);

    // 这条 select 是公开列清单之外的例外，所以逐列写明：多取的只有
    // api_key_cipher 一列，且它下面立刻就被解密消费掉
    const { data: row, error: readError } = await adminDb()
      .from('ai_providers')
      .select('id, label, protocol, model, base_url, api_key_cipher')
      .eq('id', id)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!row) {
      return NextResponse.json(
        { error: 'not_found', message: '这条接入不存在，可能已经被删掉了' },
        { status: 404 },
      );
    }

    const result = await runTest(row);

    const { data: updated, error: updateError } = await adminDb()
      .from('ai_providers')
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_ok: result.ok,
        // 成功时清掉上次的失败原因，否则页面上会挂着一条早就修好的报错
        last_test_error: result.error,
      })
      .eq('id', id)
      .select(PROVIDER_PUBLIC_COLUMNS)
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) {
      // 测试跑完的这几秒里被人删掉了。测试结论没地方存，但仍然要告诉调用方
      return NextResponse.json(
        { error: 'not_found', message: '这条接入在测试期间被删除了' },
        { status: 404 },
      );
    }

    await writeAudit({
      adminUserId: session.id,
      username: session.username,
      action: 'provider_tested',
      // error 是分类后的固定文案，不是上游原文，可以放心留痕
      detail: {
        provider_id: updated.id,
        label: updated.label,
        model: updated.model,
        ok: result.ok,
        error: result.error,
      },
      ip,
    });

    return NextResponse.json({ ok: result.ok, error: result.error, provider: toProviderView(updated) });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * 解密 + 发请求。
 *
 * 解密失败单独成一类结论，不当成 500：它有明确的成因（SETTINGS_ENCRYPTION_KEY
 * 换过了，或者密文被改动过）和明确的补救办法（重新填一次 key）。让它以
 * last_test_ok = false 的形式停在页面上，比抛一个 500 更能引导人去修。
 */
async function runTest(row: {
  protocol: 'anthropic' | 'openai_compatible';
  model: string;
  base_url: string | null;
  api_key_cipher: string;
}) {
  let apiKey: string;
  try {
    apiKey = decryptSecret(row.api_key_cipher);
  } catch (error) {
    // 详细原因（密钥不对 / 密文被改）留在服务端日志里
    console.error('[admin] 接入 key 解密失败', error);
    return {
      ok: false,
      error: '存储的 API Key 解不开：加密主密钥已变更，请重新填写一次 API Key',
    };
  }

  return testProviderConnectivity({
    protocol: row.protocol,
    model: row.model,
    baseUrl: row.base_url,
    apiKey,
  });
}
