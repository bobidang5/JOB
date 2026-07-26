import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../database.types';

/**
 * 运营后台专用的 service_role 客户端。
 *
 * 前台接口刻意不用 service_role（理由见 lib/supabase.ts）：那些接口只碰
 * 调用者自己的数据，anon key + 用户 JWT 就够了，RLS 还能替应用代码里的
 * 归属判断兜一道底。
 *
 * 后台是另一回事。它要跨全体用户做汇总，还要读 admin_users、ai_providers
 * 这种「谁都不该读」的表——迁移给它们启用了 RLS 但一条策略都没写，
 * anon 与 authenticated 一行都取不到。这类查询按定义就越过了 RLS，
 * 除了 service_role 没有第二条路。
 *
 * 代价是安全边界从数据库挪到了应用代码上，所以这把 key 的活动范围必须
 * 钉死：只允许出现在 lib/admin/ 与 app/api/admin/ 之下，且这两处的每个
 * 入口都先过 middleware.ts 的轻校验 + readAdminSession() 的完整校验。
 * 任何前台路由 import 到这个文件都算事故。
 */

let cached: SupabaseClient<Database> | null = null;

export function adminDb(): SupabaseClient<Database> {
  if (cached) return cached;

  // 读在函数里而不是模块顶层：缺配置时应该是「访问后台报错」，
  // 而不是整个应用在 import 阶段就起不来。
  const url = process.env.SUPABASE_URL ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  const missing = [
    url ? null : 'SUPABASE_URL',
    serviceRoleKey ? null : 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter((name): name is string => name !== null);

  // 缺配置绝不静默降级成 anon key：那样后台会「能打开但什么都查不到」，
  // 看上去像没有数据，实际上是权限不够——这种故障最难查。
  if (missing.length > 0) {
    throw new Error(
      `运营后台缺少环境变量：${missing.join('、')}。` +
        'service_role key 只能配在服务端，绝不能带 EXPO_PUBLIC_/NEXT_PUBLIC_ 前缀。',
    );
  }

  cached = createClient<Database>(url, serviceRoleKey, {
    // 这个客户端不代表任何一个登录用户，也不该去续任何 token
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return cached;
}
