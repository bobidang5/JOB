import { NextResponse } from 'next/server';

import { resetConfiguredAIService } from '../../../../../lib/ai';
import { protocolOf } from '../../../../../lib/ai/catalog';
import { clientIp, writeAudit } from '../../../../../lib/admin/audit';
import { adminDb } from '../../../../../lib/admin/db';
import {
  UpdateProviderSchema,
  baseUrlRuleError,
} from '../../../../../lib/admin/provider-input';
import {
  PROVIDER_PUBLIC_COLUMNS,
  toProviderView,
} from '../../../../../lib/admin/provider-view';
import { encryptSecret, maskKey } from '../../../../../lib/admin/secrets';
import { readAdminSession, unauthorizedResponse } from '../../../../../lib/admin/session';
import { errorResponse } from '../../../../../lib/http';

/** /api/admin/providers/[id] —— 修改与删除单条接入。 */

function notFound() {
  return NextResponse.json(
    { error: 'not_found', message: '这条接入不存在，可能已经被删掉了' },
    { status: 404 },
  );
}

/**
 * PATCH —— 修改接入。
 *
 * 两处容易写错的地方，都在下面标出来了：
 *   1. api_key 为空表示「不改 key」，绝不能把空串加密后盖掉原来的密文；
 *   2. is_active 置 true 前要先把其它行置 false。
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await readAdminSession();
    if (!session) return unauthorizedResponse();

    const { id } = await params;
    const patch = UpdateProviderSchema.parse(await request.json());
    const ip = clientIp(request);

    /*
     * 先读当前行再合并。
     *
     * 部分更新没法只看请求体判 base_url 该不该必填——那条规则取决于 platform，
     * 而 platform 可能这次没改。所以先取库里那行，合并出完整形态再校验。
     * 这里 select 的是公开列，不含 api_key_cipher：改配置从头到尾都不需要
     * 碰密文，只有真的换了 key 才写一份新的进去。
     */
    const { data: current, error: readError } = await adminDb()
      .from('ai_providers')
      .select(PROVIDER_PUBLIC_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!current) return notFound();

    const platform = patch.platform ?? current.platform;
    const baseUrl =
      patch.base_url !== undefined ? patch.base_url.trim() : (current.base_url ?? '');

    const ruleMessage = baseUrlRuleError(platform, baseUrl);
    if (ruleMessage) {
      return NextResponse.json(
        { error: 'invalid_request', message: ruleMessage },
        { status: 400 },
      );
    }

    /*
     * 空字符串 = 不改 key。
     *
     * 表单里那个密码框每次打开都是空的（原来的 key 根本没发给浏览器），
     * 所以「没填」是常态而不是例外。这里必须先判空再决定要不要加密——
     * 直接 encryptSecret(patch.api_key ?? '') 会把一份「空串的密文」写进去，
     * 结果是配置看着没变、下一次调用却拿着空 key 去请求。
     */
    const nextKey = patch.api_key?.trim();
    const keyChanged = !!nextKey;

    const nextActive = patch.is_active ?? current.is_active;

    // 先让位再上位：反过来会撞上 ai_providers_single_active 唯一索引。
    // 无条件执行（而不是只在 false→true 时），因为它本身是幂等的
    if (nextActive) {
      const { error: deactivateError } = await adminDb()
        .from('ai_providers')
        .update({ is_active: false })
        .eq('is_active', true)
        .neq('id', id);
      if (deactivateError) throw new Error(deactivateError.message);
    }

    const { data, error } = await adminDb()
      .from('ai_providers')
      .update({
        label: patch.label ?? current.label,
        platform,
        // 平台换了协议也跟着换，否则会用错适配器
        protocol: protocolOf(platform),
        model: patch.model ?? current.model,
        base_url: baseUrl === '' ? null : baseUrl,
        effort: patch.effort ?? current.effort,
        is_active: nextActive,
        // 只有真的填了新 key 才带上这两列，否则原来的密文原封不动
        ...(keyChanged
          ? { api_key_cipher: encryptSecret(nextKey), api_key_last4: maskKey(nextKey) }
          : {}),
      })
      .eq('id', id)
      .select(PROVIDER_PUBLIC_COLUMNS)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return notFound();

    // 改的正是当前启用的那条（或刚把它切成启用），前台缓存要立刻失效
    if (nextActive || current.is_active) resetConfiguredAIService();

    const changed = changedFields(current, data, keyChanged);
    const activated = nextActive && !current.is_active;

    await writeAudit({
      adminUserId: session.id,
      username: session.username,
      // 枚举里 activated 和 updated 是两回事，切换启用项是更值得单独看见的
      // 一类操作——它直接改变了所有用户下一次调用打到哪儿
      action: activated ? 'provider_activated' : 'provider_updated',
      detail: {
        provider_id: data.id,
        label: data.label,
        platform: data.platform,
        model: data.model,
        changed,
        // 换没换 key 只记这两项：布尔量 + 新的后 4 位，明文与密文都不进审计
        key_changed: keyChanged,
        last4: data.api_key_last4,
      },
      ip,
    });

    return NextResponse.json({ provider: toProviderView(data) });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE —— 删除接入。
 *
 * 删掉当前启用的那条不拦，但要在响应里说清楚后果：没有启用项时前台会退回
 * AI_PROVIDER 环境变量那套（见 lib/ai/index.ts），多半就是 mock，用户会拿到
 * 一份编造的分析结果还以为模型在工作。这个提示比拦下来更有用——真想删的
 * 时候被拦住，人只会去先启用另一条再回来删，白绕一圈。
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await readAdminSession();
    if (!session) return unauthorizedResponse();

    const { id } = await params;
    const ip = clientIp(request);

    const { data: current, error: readError } = await adminDb()
      .from('ai_providers')
      .select(PROVIDER_PUBLIC_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!current) return notFound();

    const { error } = await adminDb().from('ai_providers').delete().eq('id', id);
    if (error) throw new Error(error.message);

    if (current.is_active) resetConfiguredAIService();

    await writeAudit({
      adminUserId: session.id,
      username: session.username,
      action: 'provider_deleted',
      detail: {
        provider_id: current.id,
        label: current.label,
        platform: current.platform,
        model: current.model,
        last4: current.api_key_last4,
        was_active: current.is_active,
      },
      ip,
    });

    // 有没有别的接入顶上，决定了提示语的分量。查询失败不影响删除本身，
    // 按「没有」处理，宁可多提醒一句
    const { count } = await adminDb()
      .from('ai_providers')
      .select('id', { count: 'exact', head: true });

    return NextResponse.json({
      ok: true,
      was_active: current.is_active,
      warning: current.is_active
        ? `已删除当前启用的接入「${current.label}」。现在没有任何接入处于启用状态，` +
          (count && count > 0
            ? '请到列表里启用另一条，否则简历解析与分析会退回环境变量配置（通常是 mock 数据）。'
            : '接入列表已空，简历解析与分析会退回环境变量配置（通常是 mock 数据）。')
        : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * 改了哪几项，只用于审计留痕。
 *
 * 记字段名而不是新旧值：值里有 label / model 这类无所谓的，也有将来可能加进来
 * 的敏感项，记名字是不会出错的那一边。api_key 单独用 key_changed 表达。
 */
function changedFields(
  before: { label: string; platform: string; model: string; base_url: string | null; effort: string; is_active: boolean },
  after: { label: string; platform: string; model: string; base_url: string | null; effort: string; is_active: boolean },
  keyChanged: boolean,
): string[] {
  const changed: string[] = [];
  if (before.label !== after.label) changed.push('label');
  if (before.platform !== after.platform) changed.push('platform');
  if (before.model !== after.model) changed.push('model');
  if (before.base_url !== after.base_url) changed.push('base_url');
  if (before.effort !== after.effort) changed.push('effort');
  if (before.is_active !== after.is_active) changed.push('is_active');
  if (keyChanged) changed.push('api_key');
  return changed;
}
