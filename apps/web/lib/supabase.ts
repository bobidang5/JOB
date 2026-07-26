import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? '';

/**
 * 用**调用者自己的** access token 建客户端。
 *
 * 刻意不用 service_role：这些接口操作的全是用户自己的数据，走 anon key +
 * 用户 JWT 就够了，而且这样 RLS 策略仍然生效——即便某条路由的归属判断
 * 写错了，数据库也会兜住。service_role 会绕过 RLS，把安全边界从数据库
 * 挪到应用代码里，没有理由为这些接口付这个代价。
 */
export function createUserClient(accessToken: string): SupabaseClient<Database> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('缺少 SUPABASE_URL / SUPABASE_ANON_KEY');
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export interface AuthedRequest {
  supabase: SupabaseClient<Database>;
  userId: string;
}

export class UnauthorizedError extends Error {
  constructor(message = '未登录') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/** 从 Authorization: Bearer 取 token 并换出用户身份。 */
export async function authenticate(request: Request): Promise<AuthedRequest> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : '';

  if (!token) throw new UnauthorizedError('缺少 Authorization 头');

  const supabase = createUserClient(token);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new UnauthorizedError('登录状态无效');

  return { supabase, userId: data.user.id };
}
