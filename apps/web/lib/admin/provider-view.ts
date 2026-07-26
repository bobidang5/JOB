import type { AiEffort, AiProtocol } from '../database.types';

/**
 * ai_providers 里「允许离开服务端」的那部分。
 *
 * 这个文件只做一件事：把「哪些列能出去」收敛成一个常量。ai_providers 上有
 * api_key_cipher，它既不该进 JSON 响应，也不该进 Server Component 交给
 * 客户端组件的 props —— RSC 的 props 会被序列化进 HTML，往那儿塞一段密文
 * 和直接印在页面上没有区别。
 *
 * 所以后台读这张表一律用 PROVIDER_PUBLIC_COLUMNS。列表写在一处的好处是：
 * 漏一列只是少显示一个字段，而多一列（比如复制粘贴时顺手带上
 * api_key_cipher）在这里会非常显眼，不至于藏在某条 select 的字符串中间。
 *
 * 唯一需要 api_key_cipher 的地方是连通性测试，那条 select 单独写、就地
 * 解密、明文只在那一个函数的栈上存在，不进任何返回值。
 */

/**
 * 必须是**单条字符串字面量**：supabase-js 是按字面量类型解析 select 的，
 * 用 `+` 拼起来会退化成 string，行类型跟着塌成 any。
 */
export const PROVIDER_PUBLIC_COLUMNS =
  'id, label, platform, protocol, model, base_url, api_key_last4, effort, is_active, last_tested_at, last_test_ok, last_test_error, created_at, updated_at';

/** 从数据库读出来的那一行（就是上面那串列）。 */
export interface ProviderPublicRow {
  id: string;
  label: string;
  platform: string;
  protocol: AiProtocol;
  model: string;
  base_url: string | null;
  api_key_last4: string;
  effort: AiEffort;
  is_active: boolean;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 接口响应与页面 props 的形状。
 *
 * 字段名保持 snake_case，和数据库、和后台其它接口（login 回的
 * is_default_password）一致，省掉一层没有收益的改名。
 */
export type AdminProviderView = ProviderPublicRow;

/**
 * 出口再挑一遍字段。
 *
 * 看着和 PROVIDER_PUBLIC_COLUMNS 重复，但两者防的不是同一件事：常量管的是
 * 「从数据库取什么」，这个函数管的是「往外交什么」。逐字段拷贝意味着即便
 * 上游哪天换成了 `select('*')`，多出来的列也进不到响应体里。
 */
export function toProviderView(row: ProviderPublicRow): AdminProviderView {
  return {
    id: row.id,
    label: row.label,
    platform: row.platform,
    protocol: row.protocol,
    model: row.model,
    base_url: row.base_url,
    api_key_last4: row.api_key_last4,
    effort: row.effort,
    is_active: row.is_active,
    last_tested_at: row.last_tested_at,
    last_test_ok: row.last_test_ok,
    last_test_error: row.last_test_error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
