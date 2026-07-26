import type { AiEffort, AiProtocol } from '../database.types';

import { adminDb } from './db';
import {
  PROVIDER_PUBLIC_COLUMNS,
  toProviderView,
  type AdminProviderView,
} from './provider-view';
import { decryptSecret } from './secrets';

/**
 * 读后台配好的那条 AI 接入。
 *
 * 放在 lib/admin/ 而不是 lib/ai/ 下，是为了守住那条边界：ai_providers 没有
 * 任何 RLS 策略，只有 service_role 读得到，而 service_role 客户端只允许
 * 出现在这个目录里。lib/ai/index.ts 调的是这个函数，拿到的是一个已经解好密
 * 的普通对象，它自己不碰 service_role。
 *
 * 这是唯一一个「前台路由会间接走到」的 lib/admin 文件——前台得知道用哪个
 * 平台的哪把 key 才能调模型。它只读这一张表的一行，不碰任何用户数据。
 */

/**
 * 后台列表用的全部接入（不含任何密钥）。
 *
 * 放在这儿而不是各自查一遍，是为了守住那条边界：service_role 客户端只出现在
 * lib/admin/ 与 app/api/admin/ 之下。接入配置页是个 Server Component，它落在
 * app/admin/ 里，所以不该自己 new 一个 service_role 客户端——调这个函数，拿到
 * 的是一串已经挑好字段的普通对象。
 *
 * 顺带把排序也钉在一处：启用的排最前，其余按创建时间。页面和 GET 接口取到的
 * 顺序必须一样，否则刷新一下顺序就变了。
 */
export async function listProviders(): Promise<AdminProviderView[]> {
  const { data, error } = await adminDb()
    .from('ai_providers')
    .select(PROVIDER_PUBLIC_COLUMNS)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map(toProviderView);
}

export interface ActiveProvider {
  id: string;
  label: string;
  platform: string;
  protocol: AiProtocol;
  model: string;
  baseUrl: string | null;
  effort: AiEffort;
  /** 解密后的明文 key。只在服务端内存里存在，绝不回传给浏览器 */
  apiKey: string;
}

/**
 * 当前启用的接入，没有则 null。
 *
 * 数据库上有部分唯一索引（ai_providers_single_active）保证同一时刻最多
 * 一条 is_active，所以这里 .maybeSingle() 不会因为多条而失败。
 *
 * 三种 null：没配 service_role（本地开发的常态）、没有任何启用项、
 * 表还没建（迁移没跑）。这三种都该安静地退回环境变量那套。
 * **解密失败不在此列**——那说明配是配了、但 SETTINGS_ENCRYPTION_KEY 换过，
 * 这时候悄悄退回 mock 会让用户拿到一份编造的分析结果还以为是真的，
 * 所以直接抛。
 */
export async function loadActiveProvider(): Promise<ActiveProvider | null> {
  if (!adminConfigured()) return null;

  const { data, error } = await adminDb()
    .from('ai_providers')
    .select(
      'id, label, platform, protocol, model, base_url, api_key_cipher, effort',
    )
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[ai-provider] 读取启用的接入失败，退回环境变量配置', error);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id,
    label: data.label,
    platform: data.platform,
    protocol: data.protocol,
    model: data.model,
    baseUrl: data.base_url,
    effort: data.effort,
    apiKey: decryptSecret(data.api_key_cipher),
  };
}

/**
 * 这个部署到底配没配后台。
 *
 * 看的是 adminDb() 需要的那两个变量——它在缺配置时会抛「运营后台缺少
 * 环境变量」，那对后台页面是对的行为（配错了就该报出来），但对前台路由
 * 不是：本地 clone 下来直接 pnpm dev 的人从来没打算配后台，那时候应该
 * 安静地退回 AI_PROVIDER 环境变量，而不是让上传简历报 500。
 */
function adminConfigured(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}
