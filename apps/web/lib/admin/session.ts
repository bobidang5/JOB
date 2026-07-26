import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { adminDb } from './db';

/**
 * 后台会话票据。
 *
 * 没有走 Supabase Auth：管理员不是 auth.users 里的人（后台要看的恰恰是
 * 全体 auth.users 的汇总），两套身份完全隔开，一个前台用户不管拿到什么
 * 权限都不可能顺势变成管理员。
 *
 * 票据形如 `base64url(payload).base64url(HMAC-SHA256(payload))`。长得像
 * JWT 但刻意不是：JWT 的头部自带算法字段，就有了 alg=none、HS256/RS256
 * 混淆那一类坑。这里算法写死在代码里，没有任何可协商的余地。
 *
 * 校验分两层（详见 middleware.ts）：
 *   轻校验 —— Edge runtime 的 middleware 做，只验签 + 查过期，不碰数据库，
 *     负责把「显然没登录」的请求挡在渲染和查询之前；
 *   完整校验 —— readAdminSession() 做，在验签之后再回查 token_version。
 *     改密会让 token_version + 1，所有旧票据立刻作废，而票据是自包含的，
 *     只有回数据库才知道它是不是已经被作废了。
 */

export const ADMIN_COOKIE_NAME = 'zhiyou_admin';

/** 8 小时。内部后台，够一个工作日的一段，过期了重登即可。 */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface AdminSessionPayload {
  /** admin_users.id */
  sub: string;
  username: string;
  /** admin_users.token_version */
  tv: number;
  /** 过期时刻，Unix 秒 */
  exp: number;
}

/** 完整校验之后的会话，比票据多带一个 is_default_password 给警告条用。 */
export interface AdminSession {
  id: string;
  username: string;
  tokenVersion: number;
  isDefaultPassword: boolean;
}

let generatedDevSecret: Buffer | null = null;

/** `openssl rand -base64 32` 出来是 44 个字符，32 是留了余量的下限。 */
const MIN_SECRET_LENGTH = 32;

/**
 * 签名密钥。
 *
 * 绝不内置默认值。一把写在仓库里的密钥等于公开的密钥，任何读过源码的人
 * 都能自己签一张 `{sub: 任意, tv: 0}` 的票据直接进后台——那比不加鉴权
 * 更糟，因为它看上去是有鉴权的。
 *
 * 所以生产环境缺配置直接抛错：宁可后台打不开，也不能开着一扇假门。
 * 非生产环境允许临时生成一把，让 clone 下来就能跑，但会打一条 warn。
 *
 * 太短的密钥同样拒收：一把能被字典或离线爆破猜到的 HMAC 密钥，和没有
 * 密钥是一回事，只是看上去更像配好了。
 */
export function sessionSecret(): Buffer {
  const configured = process.env.ADMIN_SESSION_SECRET;
  if (configured) {
    if (configured.trim().length < MIN_SECRET_LENGTH) {
      throw new Error(
        `ADMIN_SESSION_SECRET 太短（${configured.trim().length} 个字符，至少 ${MIN_SECRET_LENGTH}）。` +
          '短密钥能被离线爆破出来，之后任何人都能自己签一张后台票据。' +
          '用 openssl rand -base64 32 生成一把。',
      );
    }
    return Buffer.from(configured, 'utf8');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '缺少 ADMIN_SESSION_SECRET。生产环境不提供默认密钥——内置一把等于公开它，' +
        '任何人都能伪造后台会话。请生成随机串后配置，例如 openssl rand -base64 32。',
    );
  }

  if (!generatedDevSecret) {
    generatedDevSecret = randomBytes(32);
    console.warn(
      '[admin] 没有配置 ADMIN_SESSION_SECRET，本进程临时生成了一把。' +
        '重启即失效（会被登出），且 Edge runtime 的 middleware 拿不到同一把密钥，' +
        '那一层只能退化成查过期。部署前务必配置。',
    );
  }

  return generatedDevSecret;
}

/** 按当前时间签一张 8 小时的票据。 */
export function issueSessionToken(
  admin: { id: string; username: string; token_version: number },
  secret: Buffer = sessionSecret(),
): string {
  return signSessionToken(
    {
      sub: admin.id,
      username: admin.username,
      tv: admin.token_version,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    },
    secret,
  );
}

export function signSessionToken(
  payload: AdminSessionPayload,
  secret: Buffer = sessionSecret(),
): string {
  // 签的是编码之后的字符串，不是 JSON 本身：校验方直接对手里的那段原文
  // 算 HMAC，不需要先反序列化再重新序列化——键顺序、空格、数字写法上的
  // 任何差异都会让签名对不上，而那些差异跟安全一点关系都没有。
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

/**
 * 验签 + 查过期。通过返回 payload，任何一项不过返回 null。
 *
 * 注意这里**不查 token_version**，所以它单独用不足以放行一个请求，
 * 完整校验见 readAdminSession()。
 */
export function verifySessionToken(
  token: string,
  secret: Buffer = sessionSecret(),
): AdminSessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [body, signature] = parts;
  if (!body || !signature) return null;

  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(signature, 'base64url');

  // HMAC-SHA256 的输出长度是固定的 32 字节，是公开常量，所以这条长度
  // 判断不泄露任何秘密——它只是替 timingSafeEqual 挡住长度不等会抛异常。
  // 真正的逐字节比较仍然走常数时间。
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(given, expected)) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  // 签名已经过了，理论上 payload 一定是我们自己写的那个形状；仍然校一遍，
  // 免得换了 payload 结构的旧票据以 undefined 的形式漏进下游
  if (!isSessionPayload(decoded)) return null;
  if (decoded.exp <= Math.floor(Date.now() / 1000)) return null;

  return decoded;
}

function isSessionPayload(value: unknown): value is AdminSessionPayload {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sub === 'string' &&
    typeof candidate.username === 'string' &&
    typeof candidate.tv === 'number' &&
    typeof candidate.exp === 'number'
  );
}

/**
 * 完整校验：从 cookie 取票据，验签、查过期，再回查 token_version。
 *
 * 这是后台唯一的权威判断。每个读写后台数据的 Server Component 和
 * Route Handler 都必须自己调一次——middleware 那层挡不住已经被改密作废的
 * 票据（它上不了数据库），也不该被当成安全边界。
 */
export async function readAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  const { data, error } = await adminDb()
    .from('admin_users')
    .select('id, username, token_version, is_default_password')
    .eq('id', payload.sub)
    .maybeSingle();

  if (error) {
    // 查不动数据库时按未登录处理：宁可把人挡在外面，也不能因为一次
    // 数据库抖动就放行一张无法核实的票据
    console.error('[admin] 回查会话失败', error.message);
    return null;
  }

  // 管理员被删（data 为 null），或者改过密（tv 对不上）——两种都作废
  if (!data || data.token_version !== payload.tv) return null;

  return {
    id: data.id,
    username: data.username,
    tokenVersion: data.token_version,
    isDefaultPassword: data.is_default_password,
  };
}

/**
 * readAdminSession() 返回 null 时的统一响应。
 *
 * 每个后台 Route Handler 开头都要写一遍「取会话，没有就 401」，抽出来是为了
 * 这句话在所有入口逐字一致——状态码或文案在某条路由上跑偏，前端就得为它写
 * 特例。措辞刻意不区分「没登录」和「票据已作废」，那个区别只对攻击者有用。
 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: 'unauthorized', message: '后台会话无效，请重新登录' },
    { status: 401 },
  );
}

/** cookie 属性。改这里要同步想一遍 middleware.ts 里读 cookie 的那段。 */
export function sessionCookieOptions() {
  return {
    // 浏览器 JS 读不到，即便后台某处出了 XSS 也偷不走票据
    httpOnly: true,
    // 顶层导航带得上（登录成功后跳 /admin），跨站发起的表单 POST 带不上，
    // 等于顺手挡掉了 CSRF
    sameSite: 'lax' as const,
    // 本地开发跑在 http 上，强制 secure 会导致 cookie 根本存不下来
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(ADMIN_COOKIE_NAME, token, sessionCookieOptions());
}

export function clearSessionCookie(response: NextResponse): void {
  // 服务端只能让浏览器覆盖掉它，做不到「作废」——真正的作废靠 token_version
  response.cookies.set(ADMIN_COOKIE_NAME, '', { ...sessionCookieOptions(), maxAge: 0 });
}
