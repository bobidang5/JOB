import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

/**
 * 「这个地址允许服务端替调用者去请求吗」的判断。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 * ai_providers.base_url 是后台里手填的一个字符串，服务端会拿它发两种请求：
 * 连通性测试（lib/admin/provider-test.ts），以及之后每一次真实的模型调用
 * （lib/ai/openai-compatible.ts）。两种请求都会把解密后的明文 API Key 放进
 * Authorization / x-api-key 头里。
 *
 * 于是这个字段同时是两把刀：
 *
 *   1. **SSRF**。填 http://169.254.169.254/ 就是让服务器替你去读云厂商的
 *      实例元数据（那里有临时凭据）；填 http://127.0.0.1:5432 就是拿服务器
 *      当内网端口扫描器——测试接口还会把上游状态码分类成不同的中文提示，
 *      「找不到接口」和「网络不可达」的差别足够把内网探清楚。
 *   2. **密钥外带**。把一条已经配好 key 的接入的 base_url 改成自己的服务器
 *      （改 base_url 不需要重填 key），下一次测试就会把那把明文 key 送上门。
 *      这一条会把 secrets.ts 那套静态加密整个绕开——加密防的是数据库泄漏，
 *      防不住「服务端自己主动把明文发出去」。
 *
 * 两条都在鉴权之后，需要一个有效的后台会话。但后台的价值就在于它是内网里
 * 权限最高的那个入口，一次会话劫持不该顺带升级成「读云元数据」。
 *
 * ── 防到什么程度 ────────────────────────────────────────────────────
 * 三道，一道比一道晚：
 *
 *   写入时（describeUnsafeUpstreamUrl）—— 纯字符串判断，把明显的内网地址
 *     挡在数据库外面，并且能给出一句人话而不是等到测试时才失败。
 *   发请求前（assertUpstreamUrlAllowed）—— 真解析一次 DNS，逐个检查解析出来
 *     的地址。这一步不能省：写入时是合法域名、解析出来指向 127.0.0.1 的
 *     情况（DNS rebinding，或者干脆就是内网 DNS）字符串判断看不出来。
 *   发请求时（redirect: 'manual'）—— 一个公网地址回一个 302 指向
 *     169.254.169.254，fetch 默认会跟过去，前两道就都白做了。
 *
 * 仍然存在的窗口：DNS 检查与实际连接之间地址可能变（TOCTOU）。堵死它要在
 * socket 层把连接钉在已检查过的 IP 上（自定义 undici dispatcher），代价是
 * 接管整条连接路径。对一个内部后台，三道防线加上「这一步本来就要管理员
 * 身份」够了；真要上多租户环境，这里得换成出网代理白名单。
 */

/** 允许放行内网地址的开关。默认关闭。 */
const ALLOW_PRIVATE_ENV = 'ADMIN_ALLOW_INSECURE_BASE_URL';

export class UnsafeUpstreamUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUpstreamUrlError';
  }
}

/**
 * 自建部署的逃生口。
 *
 * 有人确实会把 base_url 指向内网：局域网里跑一台 vLLM、本机跑 Ollama，
 * 这些都是 catalog 里「自定义端点」那一项的正当用法。所以不能一刀切死，
 * 但也不能默认开着——默认关闭意味着「要放开内网，得有人显式做一次决定」。
 */
export function allowsPrivateUpstream(): boolean {
  const raw = process.env[ALLOW_PRIVATE_ENV];
  return raw === '1' || raw?.toLowerCase() === 'true';
}

const ALLOW_HINT =
  `。确实要指向内网或用明文 http，请在服务端设 ${ALLOW_PRIVATE_ENV}=1 后重试`;

/**
 * 纯字符串层面的检查，合法返回 null，不合法返回一句给管理员看的话。
 *
 * 不查 DNS，所以可以在表单校验里同步调用。它挡不住「域名解析到内网」，
 * 那一层交给 assertUpstreamUrlAllowed()。
 */
export function describeUnsafeUpstreamUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return '接口地址不是合法的 URL';
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return '接口地址必须以 http:// 或 https:// 开头';
  }

  // 用户名密码写在 URL 里，一是没有平台需要，二是它会被原样存进数据库、
  // 打进日志，等于又多了一份不受管理的凭据
  if (url.username || url.password) {
    return '接口地址里不要带用户名和口令';
  }

  const relaxed = allowsPrivateUpstream();

  // 明文 http 会把 API Key 以 Bearer 头的形式裸奔在网络上。公网地址上
  // 这是实打实的泄漏，不是洁癖
  if (url.protocol === 'http:' && !relaxed) {
    return `接口地址必须用 https：http 会让 API Key 明文过网${ALLOW_HINT}`;
  }

  if (relaxed) return null;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (isBlockedHostname(host)) {
    return `不允许把接口地址指向内网或本机（${url.hostname}）${ALLOW_HINT}`;
  }

  if (isIP(host) && isPrivateAddress(host)) {
    return `不允许把接口地址指向内网、回环或链路本地地址（${url.hostname}）${ALLOW_HINT}`;
  }

  return null;
}

/**
 * 发请求之前的最后一道：真解析一次 DNS，任何一个解析结果落在内网就拒。
 *
 * 逐个检查而不是只看第一个：一个域名可以同时给出一个公网 A 记录和一个
 * 127.0.0.1，fetch 挑哪个不由我们决定。
 *
 * 用 dns.lookup 而不是 dns.resolve，因为前者走的是系统解析器——它认得
 * hosts 文件，也认得 `http://2130706433/`、`http://0177.0.0.1/` 这类
 * 十进制/八进制写法的 IPv4，而那正是绕过字符串检查最常用的手法。
 */
export async function assertUpstreamUrlAllowed(raw: string): Promise<void> {
  const message = describeUnsafeUpstreamUrl(raw);
  if (message) throw new UnsafeUpstreamUrlError(message);

  if (allowsPrivateUpstream()) return;

  const host = new URL(raw.trim()).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(host)) return; // 字面量已经在上面查过了

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    // 解析不了就让 fetch 自己去失败，报错信息比这里编一句更准确
    return;
  }

  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new UnsafeUpstreamUrlError(
        `接口地址 ${host} 解析到了内网地址 ${address}，已拒绝请求${ALLOW_HINT}`,
      );
    }
  }
}

/**
 * fetch 的重定向策略。
 *
 * 默认的 'follow' 会让前面两道检查全部失效：上游只要回一个
 * `302 Location: http://169.254.169.254/`，fetch 就带着 API Key 跟过去了。
 * 各家模型端点都不用重定向，直接拒收。
 */
export const NO_REDIRECT = 'manual' as const;

/** 响应是不是一次重定向（配合 redirect: 'manual' 用）。 */
export function isRedirect(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

/* ------------------------------------------------------------------ *
 * 地址分类
 * ------------------------------------------------------------------ */

/**
 * 按名字就该拒的主机名。
 *
 * 单标签主机名（不含点）一并拒掉：那要么是 localhost 之类的本机别名，
 * 要么是内网 DNS 后缀补全出来的短名，要么是 `http://2130706433/` 这种
 * 整数形式的 IPv4。公网上的模型端点不会长这样。
 */
function isBlockedHostname(host: string): boolean {
  if (!host) return true;
  if (!host.includes('.')) return true;

  const suffixes = ['.localhost', '.local', '.internal', '.home.arpa', '.localdomain'];
  return suffixes.some((suffix) => host.endsWith(suffix));
}

/**
 * 这个 IP 是不是「不该让服务器替谁去访问」的地址。
 *
 * 覆盖 RFC1918 私网、回环、链路本地（含 169.254.169.254 这个云元数据的
 * 事实标准地址）、CGNAT、多播与保留段，IPv6 侧覆盖 ULA、链路本地、回环，
 * 以及 ::ffff: 映射过来的 IPv4——后者是最容易漏的一种写法。
 */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateV4(ip);
  if (version === 6) return isPrivateV6(ip.toLowerCase());
  // 认不出来的一律当不安全：这里宁可误伤
  return true;
}

function isPrivateV4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];

  if (a === 0) return true; // 0.0.0.0/8，其中 0.0.0.0 在多数栈上就是本机
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // 回环
  if (a === 169 && b === 254) return true; // 链路本地，云元数据在这儿
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 IETF 协议专用
  if (a === 198 && (b === 18 || b === 19)) return true; // 基准测试段
  if (a >= 224) return true; // 多播 + 240/4 保留 + 广播

  return false;
}

function isPrivateV6(ip: string): boolean {
  if (ip === '::' || ip === '::1') return true;

  // ::ffff:127.0.0.1 与 ::ffff:7f00:1 是同一个地址的两种写法，都要还原成
  // v4 再判——只认前一种的话，后一种就直接漏过去了
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateV4(mapped[1]);
  const mappedHex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex?.[1] && mappedHex[2]) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);
    return isPrivateV4(
      [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.'),
    );
  }

  const head = ip.split(':')[0] ?? '';
  if (head.startsWith('fe8') || head.startsWith('fe9') || head.startsWith('fea') || head.startsWith('feb')) {
    return true; // fe80::/10 链路本地
  }
  if (/^f[cd]/.test(head)) return true; // fc00::/7 唯一本地地址
  if (head.startsWith('ff')) return true; // ff00::/8 多播
  if (ip.startsWith('2002:')) return true; // 6to4，可以把 v4 内网地址包进来
  if (ip.startsWith('64:ff9b:')) return true; // NAT64

  return false;
}
