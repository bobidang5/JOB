import { NextResponse } from 'next/server';

import { resetConfiguredAIService } from '../../../../lib/ai';
import { protocolOf } from '../../../../lib/ai/catalog';
import { clientIp, writeAudit } from '../../../../lib/admin/audit';
import { adminDb } from '../../../../lib/admin/db';
import { CreateProviderSchema } from '../../../../lib/admin/provider-input';
import {
  PROVIDER_PUBLIC_COLUMNS,
  toProviderView,
} from '../../../../lib/admin/provider-view';
import { listProviders } from '../../../../lib/admin/providers';
import { encryptSecret, maskKey } from '../../../../lib/admin/secrets';
import { readAdminSession, unauthorizedResponse } from '../../../../lib/admin/session';
import { errorResponse } from '../../../../lib/http';

/**
 * /api/admin/providers —— AI 接入的列表与新建。
 *
 * 两个处理函数都自己调一次 readAdminSession()。middleware 已经拦过一道，但
 * 那层跑在 Edge runtime 上、查不了 token_version，一张改密后作废的票据它是
 * 放行的（理由见 middleware.ts 顶部）。权威判断只在这一层。
 */

/**
 * GET —— 列出全部接入。
 *
 * 响应里没有 api_key_cipher，也没有任何形式的明文 key：查询用
 * PROVIDER_PUBLIC_COLUMNS，出口再过一次 toProviderView()。能核对「填的是哪把
 * key」的只有 api_key_last4 那 4 位。
 */
export async function GET() {
  try {
    const session = await readAdminSession();
    if (!session) return unauthorizedResponse();

    // 和接入配置页共用同一个查询，连排序都一样——页面初次渲染和之后的每次
    // 重取必须给出同一个顺序，否则改完一条记录列表就会跳一下
    return NextResponse.json({ providers: await listProviders() });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST —— 新建接入。
 *
 * 明文 key 的活动范围就是这个函数体：从请求体拿到，立刻加密成密文和后 4 位
 * 两个字段，之后再没有任何地方引用它。insert 的 .select() 用的仍然是公开列
 * 清单，所以连回显都取不到密文。
 */
export async function POST(request: Request) {
  try {
    const session = await readAdminSession();
    if (!session) return unauthorizedResponse();

    const body = CreateProviderSchema.parse(await request.json());
    const ip = clientIp(request);

    const apiKey = body.api_key.trim();
    const baseUrl = body.base_url?.trim() ?? '';
    const isActive = body.is_active ?? false;

    /*
     * 启用互斥在应用层也做一遍。
     *
     * 数据库上有部分唯一索引 ai_providers_single_active 兜底，但让用户撞上它
     * 只会得到一句「duplicate key value violates unique constraint
     * ai_providers_single_active」——那对填表的人毫无意义。先把其它行置 false，
     * 索引就退回成一道「代码写错了才会响」的保险。
     */
    if (isActive) {
      const { error: deactivateError } = await adminDb()
        .from('ai_providers')
        .update({ is_active: false })
        .eq('is_active', true);
      if (deactivateError) throw new Error(deactivateError.message);
    }

    const { data, error } = await adminDb()
      .from('ai_providers')
      .insert({
        label: body.label,
        platform: body.platform,
        // protocol 由平台推出来，不接受客户端指定：它决定用哪个适配器发请求，
        // 让它和 platform 脱钩就等于允许写进一条「协议靠猜」的记录
        protocol: protocolOf(body.platform),
        model: body.model,
        // anthropic 留空走官方端点，存 null 而不是空串——迁移里的 CHECK 约束
        // 认的是 null
        base_url: baseUrl === '' ? null : baseUrl,
        api_key_cipher: encryptSecret(apiKey),
        api_key_last4: maskKey(apiKey),
        effort: body.effort ?? 'high',
        is_active: isActive,
      })
      .select(PROVIDER_PUBLIC_COLUMNS)
      .single();

    if (error) throw new Error(error.message);

    // 前台的接入配置有 30 秒缓存，新建即启用时清一下，省得刚配完还要等半分钟。
    // 只对当前进程有效，多实例部署下其余实例照旧等 TTL 过期
    if (isActive) resetConfiguredAIService();

    await writeAudit({
      adminUserId: session.id,
      username: session.username,
      action: 'provider_created',
      /*
       * detail 里只有 last4。
       *
       * 字段名也刻意不叫 api_key_last4——audit.ts 里那条兜底正则会把带
       * api_key 的键名整个换成 [redacted]，那样审计表里连后 4 位都看不到，
       * 排查时反而少了线索。
       */
      detail: {
        provider_id: data.id,
        label: data.label,
        platform: data.platform,
        model: data.model,
        last4: data.api_key_last4,
        is_active: data.is_active,
      },
      ip,
    });

    return NextResponse.json({ provider: toProviderView(data) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
