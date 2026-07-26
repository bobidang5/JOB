import type { AdminAction } from '../database.types';

import { adminDb } from './db';

/**
 * 后台操作留痕。
 *
 * 这张表存在的意义是「事后能查清是谁在什么时候动了什么」，所以它必须能
 * 被放心地整表读出来给人看。反过来说，任何一条敏感值落进 detail，都会在
 * 后台页面上被原样渲染出来——api key 明文尤其不行，它一旦进了这张表就
 * 等于多存了一份，还是明文的那份。
 */

export interface AuditEntry {
  /** 管理员被删时可以为 null，username 那列会留下冗余的一份 */
  adminUserId?: string | null;
  username: string;
  action: AdminAction;
  detail?: Record<string, unknown>;
  ip?: string | null;
}

/**
 * 按字段名兜一道底。
 *
 * 约定是调用方自己只往 detail 里放 last4 这类脱敏值，这条正则防的是以后
 * 有人顺手写 `detail: provider` 把整行连密文一起塞进来。它是补丁不是防线
 * ——真正的规矩仍然是「调用点自己挑字段」。
 */
const SENSITIVE_KEY = /(api_?key|password|secret|credential|authorization)/i;

function redact(detail: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    safe[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : value;
  }
  return safe;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  const { error } = await adminDb()
    .from('admin_audit_log')
    .insert({
      admin_user_id: entry.adminUserId ?? null,
      // 登录失败那条会把用户输入的用户名原样记下来（那是排查的关键线索），
      // 所以要自己截断——admin_users 上有 3..32 的约束，这张表没有
      username: entry.username.slice(0, 64),
      action: entry.action,
      detail: redact(entry.detail ?? {}),
      ip: entry.ip ?? null,
    });

  if (error) {
    // 留痕失败不回滚也不抛：一次日志写入失败不该把正在进行的登录或改密
    // 一起搞挂。丢的是一条记录，抛出去丢的是一次操作。
    console.error('[admin] 审计写入失败', { action: entry.action, message: error.message });
  }
}

/**
 * 取调用方 IP。
 *
 * 反代会把整条链路拼成 `client, proxy1, proxy2`，第一段才是最初的客户端。
 * 这个头是可以伪造的，所以它只用来留痕和给限流分桶，**绝不作为任何授权
 * 依据**——把 IP 当白名单用的话，伪造一个头就绕过去了。
 */
export function clientIp(request: Request): string | null {
  const first = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (!first) return null;
  // 同样是可控输入，截断一下再入库
  return first.slice(0, 64);
}
