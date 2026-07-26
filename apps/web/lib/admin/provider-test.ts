import type { AiProtocol } from '../database.types';
import {
  NO_REDIRECT,
  UnsafeUpstreamUrlError,
  assertUpstreamUrlAllowed,
  isRedirect,
} from '../upstream-url';

/**
 * 接入配置的连通性测试。
 *
 * 用这条配置真发一次最小请求，回答一个问题：**这把 key、这个地址、这个型号
 * 现在能不能用**。不校验模型输出质量，也不解析响应体——只要上游回了 2xx，
 * 说明地址通、鉴权过、型号认得，测试就算过。
 *
 * ── last_test_error 里绝不放上游原文 ──────────────────────────────────
 * 这条是硬规矩。各家出错时爱把请求回显一段，OpenAI 那种
 * 「Incorrect API key provided: sk-****abcd」直接就带着 key 的片段；把响应体
 * 整段存进数据库，等于在一张给人看的表里长期留一份密钥碎片，还会跟着备份、
 * 只读副本一起扩散。所以这里只输出**固定的几句中文**，全部是从 HTTP 状态码
 * 推出来的，函数不可能把上游的字节原样传出去。
 */

const TIMEOUT_MS = 15_000;

/** 官方端点。base_url 留空的 anthropic 接入走这个 */
const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com';

/** Anthropic 的 API 版本头，和 SDK 用的是同一个 */
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * 测试请求的输出上限。
 *
 * 取一个很小的值是为了省钱：这次调用的产出没人看。截断不是错误——超出上限
 * 只会让响应带上 stop_reason: "max_tokens"，HTTP 仍然是 200，连通性照样测到。
 */
const PING_MAX_TOKENS = 16;

export interface ProviderTestConfig {
  protocol: AiProtocol;
  model: string;
  /** anthropic 可以为空（走官方端点）；openai_compatible 必填 */
  baseUrl: string | null;
  /** 明文 key。只在这次调用期间存在，不进任何返回值 */
  apiKey: string;
}

export interface ProviderTestResult {
  ok: boolean;
  /** 成功时为 null；失败时是下面那几句固定文案之一 */
  error: string | null;
}

export async function testProviderConnectivity(
  config: ProviderTestConfig,
): Promise<ProviderTestResult> {
  try {
    /*
     * 发请求之前先确认这个地址允许访问。
     *
     * 这是 SSRF 的主要落点：下面那次 fetch 会把解密后的明文 API Key 放进
     * 请求头送到 baseUrl 指定的任何地方。写入时已经拦过一道字符串检查，
     * 这里再解析一次 DNS——「域名合法、解析到 127.0.0.1」是字符串看不出来的。
     * 详见 lib/upstream-url.ts。
     */
    const target = resolveTargetBase(config);
    await assertUpstreamUrlAllowed(target);

    const response =
      config.protocol === 'anthropic'
        ? await pingAnthropic(config)
        : await pingOpenAICompatible(config);

    // redirect: 'manual' 之后 3xx 会原样回到这里。跟过去就等于让上游
    // 指哪打哪，前面两道检查白做，所以直接判失败
    if (isRedirect(response)) {
      return {
        ok: false,
        error: `接口返回了重定向（HTTP ${response.status}）：不会跟随，请直接填最终地址`,
      };
    }

    if (response.ok) return { ok: true, error: null };

    // 读一遍响应体，但它只用来在 400 里区分「型号不对」和「参数不对」，
    // 出口永远是下面那几句固定文案，原文既不返回也不入库
    const detail = await response.text().catch(() => '');
    return { ok: false, error: classifyTestFailure(response.status, detail) };
  } catch (error) {
    // 这一类的 message 是我们自己写的固定文案，讲的是「地址不许指向内网」，
    // 里面没有上游的任何字节，可以原样给管理员看
    if (error instanceof UnsafeUpstreamUrlError) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: describeTransportError(error) };
  }
}

/** 这次测试实际会打到哪个基地址。anthropic 留空时是官方端点。 */
function resolveTargetBase(config: ProviderTestConfig): string {
  const base = config.baseUrl?.trim() ?? '';
  if (config.protocol === 'anthropic' && !base) return ANTHROPIC_DEFAULT_BASE_URL;
  return base;
}

/**
 * Anthropic 原生端点：POST {base}/v1/messages。
 *
 * 刻意**不带 thinking 参数**。各代模型对它的接受面不一样——Opus 5 默认就开着
 * 思考，显式 disabled 只在 effort ≤ high 时合法；Fable 5 上任何显式配置都直接
 * 400。不传是唯一在所有型号上都成立的写法，代价只是这次 ping 可能思考几个
 * token 然后被 max_tokens 截断，而截断照样是 200。
 *
 * 同理不带 effort：这里测的是连通性，不是模型行为，少一个参数少一种被拒的理由。
 */
function pingAnthropic(config: ProviderTestConfig): Promise<Response> {
  const base = trimSlash(config.baseUrl?.trim() || ANTHROPIC_DEFAULT_BASE_URL);

  return fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: PING_MAX_TOKENS,
      messages: [{ role: 'user', content: 'ping' }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: NO_REDIRECT,
  });
}

/**
 * OpenAI 兼容端点：POST {base}/chat/completions。
 *
 * 输出上限的字段名要试两次：OpenAI 的新型号（o 系列、gpt-5 等）改用了
 * max_completion_tokens，还发 max_tokens 会被 400 拒掉。这与
 * lib/ai/openai-compatible.ts 里那条降级是同一个已知不兼容，在这儿重来一遍是
 * 因为：如果不处理，一条配置完全正确的 gpt-5 接入会被测成「型号不存在」，
 * 那比不做测试还糟。
 *
 * 只按报错文案匹配、只重试一次——那句话里一定带着新字段名，认不出来就说明
 * 这个 400 是别的原因，再试也没用。
 */
async function pingOpenAICompatible(config: ProviderTestConfig): Promise<Response> {
  const first = await postChatCompletions(config, 'max_tokens');
  if (first.ok) return first;
  if (first.status !== 400 && first.status !== 422) return first;

  const detail = await first.clone().text().catch(() => '');
  if (!detail.toLowerCase().includes('max_completion_tokens')) return first;

  return postChatCompletions(config, 'max_completion_tokens');
}

function postChatCompletions(
  config: ProviderTestConfig,
  tokenLimitField: 'max_tokens' | 'max_completion_tokens',
): Promise<Response> {
  const base = trimSlash(config.baseUrl?.trim() ?? '');

  return fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: 'ping' }],
      [tokenLimitField]: PING_MAX_TOKENS,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: NO_REDIRECT,
  });
}

/**
 * HTTP 状态码 → 一句给管理员看的话。
 *
 * detail 是上游响应体，**只当布尔量用**：在 400 里判断报错是不是跟型号有关。
 * 它的任何字节都不会出现在返回值里。
 */
export function classifyTestFailure(status: number, detail: string): string {
  if (status === 401) return '鉴权失败：API Key 不正确或已失效';
  if (status === 403) return '没有权限：这把 Key 不允许访问该型号或该接口';
  if (status === 404) return '找不到接口或型号：检查接口地址与型号名是否写对';
  if (status === 429) return '触发限流：稍后再试，或检查账户余额与配额';
  if (status === 413) return '请求过大被拒绝（这不该发生，测试请求很小）';
  if (status === 408 || status === 504) return '上游超时：服务当前响应不过来';

  if (status === 400 || status === 422) {
    // 各家 400 的文案没有统一格式，只做一次极窄的关键词判断：提到 model 的
    // 基本都是型号名的问题，这是填错概率最高的一项
    return detail.toLowerCase().includes('model')
      ? '型号不存在或当前账号不可用：核对型号名'
      : '请求被拒绝（400）：多半是型号名或接口地址不对';
  }

  // 529 是 Anthropic 的「过载」，和 5xx 归一类：都不是配置问题
  if (status >= 500) return `上游服务异常（HTTP ${status}）：稍后再试`;

  return `请求失败（HTTP ${status}）`;
}

/**
 * 连响应都没拿到的那一类。
 *
 * AbortSignal.timeout() 抛的是 TimeoutError，手动 abort 抛 AbortError，两者都
 * 归到超时；剩下的（DNS 解析不了、连接被拒、TLS 握手失败）在 undici 里统统
 * 是一个 message 为 'fetch failed' 的 TypeError，分不细也没必要分——对管理员
 * 来说要做的事是一样的：检查地址和出网。
 */
export function describeTransportError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';

  if (name === 'TimeoutError' || name === 'AbortError') {
    return `请求超时（${TIMEOUT_MS / 1000} 秒）：地址不通，或上游响应太慢`;
  }

  return '网络不可达：域名解析或建立连接失败，检查接口地址与服务器出网策略';
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}
