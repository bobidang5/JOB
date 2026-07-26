import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  classifyTestFailure,
  describeTransportError,
  testProviderConnectivity,
} from './provider-test';

/**
 * 连通性测试的用例分两类：
 *
 *   1. 请求长什么样——两种协议打的地址、鉴权头、请求体都不一样，而且
 *      anthropic 那条**不能带 thinking 参数**（各代模型对它的接受面不同，
 *      Fable 5 上任何显式配置都直接 400）。这些一旦写错，表现是「配置明明
 *      对的却测不通」，比测不出来更误导人。
 *
 *   2. 出错时交出去的是什么——last_test_error 会入库、会显示在页面上，
 *      所以上游响应体一个字节都不能混进去。下面有一条专门拿带 key 片段的
 *      报错原文去撞它。
 *
 * 全程 vi.stubGlobal('fetch')，不联网、不需要任何真 key。
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 记下每次 fetch 的参数，返回预设的响应 */
function stubFetch(...responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  let index = 0;

  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return Promise.resolve(response!.clone());
  });

  return calls;
}

function body(call: { init: RequestInit }): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

const ANTHROPIC = {
  protocol: 'anthropic' as const,
  model: 'claude-opus-5',
  baseUrl: null,
  apiKey: 'sk-ant-secret-1234',
};

const COMPATIBLE = {
  protocol: 'openai_compatible' as const,
  model: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-secret-1234',
};

describe('testProviderConnectivity —— anthropic', () => {
  it('打官方 /v1/messages，带 x-api-key 与版本头', async () => {
    const calls = stubFetch(new Response('{}', { status: 200 }));

    const result = await testProviderConnectivity(ANTHROPIC);

    expect(result).toEqual({ ok: true, error: null });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.anthropic.com/v1/messages');

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe(ANTHROPIC.apiKey);
    expect(headers['anthropic-version']).toBe('2023-06-01');
    // 不该出现 Bearer——那是 OpenAI 兼容端点那条路
    expect(headers.authorization).toBeUndefined();
  });

  it('不带 thinking / effort 参数', async () => {
    const calls = stubFetch(new Response('{}', { status: 200 }));
    await testProviderConnectivity(ANTHROPIC);

    const payload = body(calls[0]!);
    // 显式 thinking 在不同代的模型上接受面不同（Fable 5 直接 400，
    // Opus 5 的 disabled 只在 effort ≤ high 时合法）。不传是唯一到处都成立的写法
    expect(payload.thinking).toBeUndefined();
    expect(payload.output_config).toBeUndefined();
    expect(payload.model).toBe('claude-opus-5');
    expect(payload.max_tokens).toBe(16);
  });

  it('填了 base_url 就打自定义端点，且去掉末尾斜杠', async () => {
    const calls = stubFetch(new Response('{}', { status: 200 }));
    await testProviderConnectivity({ ...ANTHROPIC, baseUrl: 'https://relay.example.com/' });
    expect(calls[0]!.url).toBe('https://relay.example.com/v1/messages');
  });
});

describe('testProviderConnectivity —— openai 兼容', () => {
  it('打 {base}/chat/completions，带 Bearer', async () => {
    const calls = stubFetch(new Response('{}', { status: 200 }));

    const result = await testProviderConnectivity(COMPATIBLE);

    expect(result.ok).toBe(true);
    expect(calls[0]!.url).toBe('https://api.deepseek.com/v1/chat/completions');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${COMPATIBLE.apiKey}`);
    expect(body(calls[0]!).max_tokens).toBe(16);
  });

  it('报错里点名 max_completion_tokens 时换字段重试一次', async () => {
    const calls = stubFetch(
      new Response(
        JSON.stringify({
          error: { message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens'." },
        }),
        { status: 400 },
      ),
      new Response('{}', { status: 200 }),
    );

    const result = await testProviderConnectivity({ ...COMPATIBLE, model: 'gpt-5' });

    // 配置完全正确的新型号不该被测成「型号不存在」
    expect(result).toEqual({ ok: true, error: null });
    expect(calls).toHaveLength(2);
    expect(body(calls[0]!).max_tokens).toBe(16);
    expect(body(calls[1]!).max_completion_tokens).toBe(16);
    expect(body(calls[1]!).max_tokens).toBeUndefined();
  });

  it('400 但没提到那个字段名时不重试', async () => {
    const calls = stubFetch(
      new Response(JSON.stringify({ error: { message: 'Invalid request' } }), { status: 400 }),
    );

    const result = await testProviderConnectivity(COMPATIBLE);

    expect(calls).toHaveLength(1);
    expect(result.ok).toBe(false);
  });
});

describe('失败信息不带上游原文', () => {
  /**
   * 这是这个文件里最重要的一条。
   *
   * OpenAI 出错时会把 key 的片段回显在报错里（`Incorrect API key provided:
   * sk-****abcd`）。last_test_error 是要入库、要在后台页面上原样渲染的，把响应体
   * 塞进去等于在一张给人看的表里长期留一份密钥碎片，还会跟着数据库备份一起扩散。
   */
  it('401 的响应体里带 key 片段时，结论里一个字都不带出来', async () => {
    const upstream = JSON.stringify({
      error: {
        message: 'Incorrect API key provided: sk-live-ABCDEF123456. You can find your API key at ...',
        type: 'invalid_request_error',
      },
    });
    stubFetch(new Response(upstream, { status: 401 }));

    const result = await testProviderConnectivity(COMPATIBLE);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('鉴权失败：API Key 不正确或已失效');
    expect(result.error).not.toContain('sk-');
    expect(result.error).not.toContain('Incorrect');
  });

  it('500 的响应体是一整页 HTML 时也只回一句话', async () => {
    stubFetch(new Response('<html><body>502 Bad Gateway ...</body></html>', { status: 503 }));

    const result = await testProviderConnectivity(COMPATIBLE);

    expect(result.error).toBe('上游服务异常（HTTP 503）：稍后再试');
    expect(result.error).not.toContain('html');
  });
});

describe('网络层错误', () => {
  it('超时说成超时', async () => {
    vi.stubGlobal('fetch', () => {
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'TimeoutError';
      return Promise.reject(error);
    });

    const result = await testProviderConnectivity(COMPATIBLE);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/超时（15 秒）/);
  });

  it('连不上说成连不上，不抛异常', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed')));

    const result = await testProviderConnectivity(COMPATIBLE);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/网络不可达/);
  });
});

describe('classifyTestFailure', () => {
  it('按状态码分类', () => {
    expect(classifyTestFailure(401, '')).toMatch(/鉴权失败/);
    expect(classifyTestFailure(403, '')).toMatch(/没有权限/);
    expect(classifyTestFailure(404, '')).toMatch(/找不到接口或型号/);
    expect(classifyTestFailure(429, '')).toMatch(/触发限流/);
    expect(classifyTestFailure(500, '')).toMatch(/上游服务异常/);
    // 529 是 Anthropic 的「过载」，归到 5xx 一类，都不是配置问题
    expect(classifyTestFailure(529, '')).toMatch(/上游服务异常/);
    expect(classifyTestFailure(418, '')).toMatch(/HTTP 418/);
  });

  it('400 里提到 model 时指向型号名', () => {
    expect(classifyTestFailure(400, 'The model `gpt-9` does not exist')).toMatch(/型号不存在/);
    expect(classifyTestFailure(400, 'Invalid request')).toMatch(/多半是型号名或接口地址不对/);
  });

  it('无论 detail 是什么，输出都不含它', () => {
    const detail = 'token=SECRET-abcdef 请求体原样回显';
    for (const status of [400, 401, 403, 404, 422, 429, 500, 503, 418]) {
      expect(classifyTestFailure(status, detail)).not.toContain('SECRET');
    }
  });
});

describe('describeTransportError', () => {
  it('AbortError 也算超时', () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    expect(describeTransportError(error)).toMatch(/超时/);
  });

  it('其余一律归为网络不可达', () => {
    expect(describeTransportError(new TypeError('fetch failed'))).toMatch(/网络不可达/);
    expect(describeTransportError('随便什么东西')).toMatch(/网络不可达/);
  });
});

describe('出网防护（SSRF 与密钥外带）', () => {
  /**
   * 这几条守的是整套后台里最贵的一个洞。
   *
   * 这个函数会解密出明文 API Key，放进 Authorization / x-api-key 头，
   * 发到 base_url 指定的地方。base_url 是后台表单里手填的，而且改它不需要
   * 重填 key——于是「把已配好的接入指向自己的服务器，点一下测试」就是一条
   * 完整的密钥外带路径，静态加密（secrets.ts）在它面前完全不起作用。
   * 顺带还能拿服务器当内网扫描器：下面 classifyTestFailure 那几句不同的
   * 中文提示，本身就是一个够用的探测回显。
   *
   * 断言里都要求 fetch 一次都没被调用——「拒绝」必须发生在发包之前，
   * 发出去再判断等于已经泄漏了。
   */

  it('回环地址：直接拒，一个包都不发', async () => {
    const calls = stubFetch(new Response('{}', { status: 200 }));

    const result = await testProviderConnectivity({
      protocol: 'openai_compatible',
      model: 'm',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: 'sk-secret',
    });

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('云元数据地址：直接拒', async () => {
    const calls = stubFetch(new Response('{}', { status: 200 }));

    const result = await testProviderConnectivity({
      protocol: 'openai_compatible',
      model: 'm',
      baseUrl: 'https://169.254.169.254/latest/meta-data',
      apiKey: 'sk-secret',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/内网|本机/);
    expect(calls).toHaveLength(0);
  });

  it('anthropic 协议同样受限——它的 base_url 也是自由填写的', async () => {
    const calls = stubFetch(new Response('{}', { status: 200 }));

    const result = await testProviderConnectivity({
      protocol: 'anthropic',
      model: 'm',
      baseUrl: 'https://10.1.2.3',
      apiKey: 'sk-secret',
    });

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('anthropic 留空走官方端点，不该被防护误伤', async () => {
    const calls = stubFetch(new Response('{}', { status: 200 }));

    const result = await testProviderConnectivity({
      protocol: 'anthropic',
      model: 'm',
      baseUrl: null,
      apiKey: 'sk-secret',
    });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.anthropic.com/v1/messages');
  });

  it('两种协议都不跟随重定向', async () => {
    // 不设 redirect: 'manual' 的话，上游回一句
    // `302 Location: http://169.254.169.254/` 就能把前面所有检查绕过去
    const calls = stubFetch(new Response('{}', { status: 200 }));
    await testProviderConnectivity({
      protocol: 'openai_compatible',
      model: 'm',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-secret',
    });

    expect(calls[0]!.init.redirect).toBe('manual');
  });

  it('3xx 判失败，且不把 Location 之类的上游信息带出来', async () => {
    stubFetch(
      new Response('', { status: 302, headers: { location: 'http://169.254.169.254/' } }),
    );

    const result = await testProviderConnectivity({
      protocol: 'openai_compatible',
      model: 'm',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-secret',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/重定向/);
    expect(result.error).not.toContain('169.254');
  });

  it('逃生口打开后放行内网（自建部署的正当用法）', async () => {
    vi.stubEnv('ADMIN_ALLOW_INSECURE_BASE_URL', '1');
    const calls = stubFetch(new Response('{}', { status: 200 }));

    const result = await testProviderConnectivity({
      protocol: 'openai_compatible',
      model: 'm',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: 'sk-secret',
    });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    vi.unstubAllEnvs();
  });
})
