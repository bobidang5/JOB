import { NextResponse } from 'next/server';
import { z } from 'zod';

import { clientIp, writeAudit } from '../../../../lib/admin/audit';
import { adminDb } from '../../../../lib/admin/db';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../../../../lib/admin/password';
import { issueSessionToken, setSessionCookie } from '../../../../lib/admin/session';
import { errorResponse } from '../../../../lib/http';

/**
 * POST /api/admin/login
 *
 * middleware 放行了这个地址（见 middleware.ts 的 PUBLIC_PATHS），所以它是
 * 整个后台唯一一条不需要会话就能打到的接口，两条防线都在这里：口令校验
 * 本身，以及下面那个限流。
 */

const LoginSchema = z.object({
  username: z.string().min(1).max(64),
  // 上限不是为了「口令别太长」，是给 scrypt 的输入封顶：口令越长单次哈希
  // 越贵，不封顶就等于对外开放了一个 CPU 放大器
  password: z.string().min(1).max(256),
});

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

/**
 * 同一个用户名在全局（不分 IP）15 分钟内允许失败的次数。
 *
 * 比按 IP 的额度松，因为它挡的是另一件事，见 tooManyAttempts() 的说明。
 */
const MAX_FAILURES_PER_USER = 30;

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * 登录限流。
 *
 * 两个桶，防的不是同一件事：
 *
 *   **按 IP + 用户名**（10 次 / 15 分钟，在校验口令之前判）
 *     挡住最普通的那种爆破，也顺手保护 CPU——每次校验都要跑一次 scrypt，
 *     不设闸门就等于对外开放了一个计算放大器。
 *
 *   **按用户名，不分 IP**（30 次失败 / 15 分钟，在校验口令之后判）
 *     上面那个桶的 key 里含 IP，而 IP 是从 x-forwarded-for 读的，那个头
 *     调用方想写什么写什么（见 lib/admin/audit.ts 里 clientIp 的说明）。
 *     每请求换一个伪造的 XFF，第一个桶就形同虚设——实测连打 80 次一个
 *     429 都不会出。所以要有一个攻击者无法影响 key 的桶。
 *
 * 为什么第二个桶要**放在口令校验之后**：它的 key 只有用户名，谁都能凑，
 * 放在校验之前就等于给了任何人一个「把管理员锁在门外 15 分钟」的按钮，
 * 而这个后台只有一个账号。放在之后，口令对的那次永远放行——攻击者制造的
 * 失败次数只会拦住其他失败尝试，拦不住真正知道口令的人。
 *
 * ⚠ 两个都是进程内 Map，**只在单实例部署下成立**。多实例（或 serverless
 * 那种随时起新实例的部署）每个进程各记各的账，攻击者多打几个实例就能把
 * 额度翻倍。真要上公网多实例，这里必须换成 Redis / Upstash 之类的共享
 * 计数器，或者把限流上移到反向代理。
 */
const buckets = new Map<string, Bucket>();
const userFailures = new Map<string, Bucket>();

function sweep(map: Map<string, Bucket>, now: number): void {
  // key 里含攻击者可控的用户名，不清理的话反复换用户名就能把内存撑爆。
  // 桶的数量涨到一定规模时顺手扫掉过期的。
  if (map.size <= 512) return;
  for (const [existing, bucket] of map) {
    if (bucket.resetAt <= now) map.delete(existing);
  }
}

/** 记一次尝试并回答「超额了吗」。 */
function bump(map: Map<string, Bucket>, key: string, max: number): boolean {
  const now = Date.now();
  sweep(map, now);

  const bucket = map.get(key);
  if (!bucket || bucket.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  bucket.count += 1;
  return bucket.count > max;
}

function tooManyAttempts(key: string): boolean {
  return bump(buckets, key, MAX_ATTEMPTS);
}

function tooManyFailuresForUser(username: string): boolean {
  return bump(userFailures, username, MAX_FAILURES_PER_USER);
}

const throttled = () =>
  NextResponse.json(
    { error: 'too_many_attempts', message: '尝试次数过多，请 15 分钟后再试' },
    { status: 429 },
  );

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const body = LoginSchema.parse(await request.json());
    const username = body.username.trim();

    // 用户名并入 key，免得同一个 IP 后面的所有人被一个人的失败连坐；
    // 转小写是为了 `Admin` 和 `admin` 落进同一个桶
    const userKey = username.toLowerCase();
    const bucketKey = `${ip ?? 'unknown'}|${userKey}`;
    if (tooManyAttempts(bucketKey)) return throttled();

    const { data: admin, error } = await adminDb()
      .from('admin_users')
      .select('id, username, password_hash, token_version, is_default_password')
      .eq('username', username)
      .maybeSingle();

    if (error) throw new Error(error.message);

    /*
     * 用户名不存在时照样跑一次哈希校验，拿一条格式合法但对不上的假串顶上。
     *
     * 如果查不到就直接 return，这条路径会比「查到了但口令错」快上整整一次
     * scrypt（几十毫秒，在网络抖动里也能量出来），于是响应时间就成了一个
     * 用户名枚举接口。两条失败路径下面也共用同一个响应体和同一个状态码。
     */
    const passwordOk = verifyPassword(body.password, admin?.password_hash ?? DUMMY_PASSWORD_HASH);

    if (!admin || !passwordOk) {
      // 这一笔只在失败时记。放在这里（而不是请求一进来就记）是刻意的：
      // 口令对的请求永远不会把这个桶推高，于是它拦不住合法管理员，
      // 只拦得住猜口令的人。理由详见 tooManyFailuresForUser 上面那段。
      const overGlobalLimit = tooManyFailuresForUser(userKey);

      await writeAudit({
        adminUserId: admin?.id ?? null,
        username,
        action: 'login_failed',
        // 到底是哪种失败只留在服务端的审计里，不进响应体
        detail: {
          reason: admin ? 'bad_password' : 'unknown_user',
          ...(overGlobalLimit ? { throttled: 'user_global' } : {}),
        },
        ip,
      });

      // 超额时换 429。注意这里换的只是**失败**响应的形态，不泄露
      // 用户名存不存在——两条失败路径到这儿仍然完全一致
      if (overGlobalLimit) return throttled();

      return NextResponse.json(
        { error: 'invalid_credentials', message: '用户名或口令不正确' },
        { status: 401 },
      );
    }

    // 登录成功就把额度还回去，免得白天正常用的人被自己早上输错的几次拖累
    buckets.delete(bucketKey);
    userFailures.delete(userKey);

    const response = NextResponse.json({
      ok: true,
      username: admin.username,
      is_default_password: admin.is_default_password,
    });
    setSessionCookie(response, issueSessionToken(admin));

    const { error: touchError } = await adminDb()
      .from('admin_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', admin.id);

    // 登录时间没记上不影响这次登录本身，记一条日志就够了
    if (touchError) console.error('[admin] 更新 last_login_at 失败', touchError.message);

    await writeAudit({
      adminUserId: admin.id,
      username: admin.username,
      action: 'login',
      ip,
    });

    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
