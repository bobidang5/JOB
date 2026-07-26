import { NextResponse, type NextRequest } from 'next/server';

/**
 * 运营后台的第一道守卫。
 *
 * ── 为什么这里只做轻校验 ────────────────────────────────────────────
 * Next 16 的 middleware 跑在 Edge runtime 上，那里没有 node:crypto，
 * scrypt 和 timingSafeEqual 都用不了；也不该在每个请求前面挂一次数据库
 * 往返——middleware 会跑在所有匹配路径上，多一次往返就是给整个后台的每次
 * 点击都加一次延迟。
 *
 * 所以这一层只做三件事：cookie 在不在、签名对不对、有没有过期。
 * token_version 的回查交给 Route Handler / Server Component 里的
 * readAdminSession()，那里跑在 Node runtime 上，能连数据库。
 *
 * ── 这一层不是安全边界 ──────────────────────────────────────────────
 * 它挡不住一张「签名有效但已经被改密作废」的票据。任何读写后台数据的
 * 入口都必须自己再调一次 readAdminSession()，不能因为「middleware 已经
 * 拦过了」就省掉。middleware 在这里的职责只有一个：把显然没登录的请求
 * 挡在渲染和查询之前，顺便把人送到登录页。
 *
 * 另：Next 16 起这个文件名已被 proxy.ts 取代（构建时会有一条 deprecated
 * 提示）。逻辑与文件名无关，将来改名直接搬过去即可。
 */

const COOKIE_NAME = 'zhiyou_admin';

/**
 * 放行清单。
 *
 * 登录页和登录接口必须放行，否则未登录的人会被无限重定向到登录页，
 * 而登录页本身又被挡住。用精确匹配而不是前缀匹配：`/admin/login` 放行，
 * 但 `/admin/loginx` 之类的路径不该跟着一起漏出去。
 */
const PUBLIC_PATHS = new Set(['/admin/login', '/api/admin/login']);

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token && (await looksLikeValidTicket(token))) return NextResponse.next();

  // 接口返回 401 JSON，页面 302 去登录页。
  // 给接口发重定向的话，前端 fetch 会跟着跳过去拿回一段 HTML，
  // 报错信息就变成了「JSON 解析失败」，把真正的原因盖掉了。
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'unauthorized', message: '后台会话无效，请重新登录' },
      { status: 401 },
    );
  }

  return NextResponse.redirect(new URL('/admin/login', request.nextUrl), 302);
}

async function looksLikeValidTicket(token: string): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [body, signature] = parts;
  if (!body || !signature) return false;

  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!secret) {
    // 生产环境缺密钥是配置事故：lib/admin/session.ts 那边会直接抛，
    // 后台根本签不出票据，这里一律拒绝，别让请求继续往后走。
    if (process.env.NODE_ENV === 'production') return false;

    /*
     * 非生产环境允许不配。session.ts 会在 Node 进程里临时生成一把，而
     * Edge runtime 是另一个隔离环境，拿不到同一把——在这里验签必然失败，
     * 结果就是本地开发怎么都进不去后台。
     *
     * 这一层本来就不是安全边界，于是退化成只查过期，把判断整个让给
     * readAdminSession()。仅限非生产，且 sessionSecret() 已经为此打过 warn。
     */
    return notExpired(body);
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const given = base64urlToBytes(signature);
  if (!given) return false;

  // crypto.subtle.verify 内部就是常数时间比较，不用（也没法，Edge 没有
  // node:crypto）再自己写一遍 timingSafeEqual
  const signatureOk = await crypto.subtle.verify(
    'HMAC',
    key,
    given,
    new TextEncoder().encode(body),
  );

  return signatureOk && notExpired(body);
}

function notExpired(body: string): boolean {
  const bytes = base64urlToBytes(body);
  if (!bytes) return false;

  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof payload !== 'object' || payload === null) return false;
    const exp = (payload as { exp?: unknown }).exp;
    return typeof exp === 'number' && exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

/**
 * Edge runtime 没有 Buffer，base64url 只能自己拼。
 *
 * 返回类型写成 Uint8Array<ArrayBuffer> 而不是裸的 Uint8Array：TS 5.7 起
 * TypedArray 带上了 buffer 的类型参数，默认的 ArrayBufferLike 含
 * SharedArrayBuffer，而 crypto.subtle 的 BufferSource 不收它。
 */
function base64urlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}
