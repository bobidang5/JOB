import {
  MOCK_ANALYSIS,
  MOCK_BASE_SCORE,
  MOCK_JD_TEXT,
  MOCK_RESUME_BEFORE,
} from '@zhiyou/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OpenAICompatibleAIService } from './openai-compatible';
import { AIContractError, AIRefusalError, AIUnsupportedInputError } from './types';

/**
 * 这个适配器面对的是「OpenAI 兼容」这个没有一致性保证的说法，所以测试的
 * 重点不是happy path，而是三条它必须自己扛住的岔路：端点不支持 json_schema、
 * 模型被内容分类器拦下、模型返回了合法 JSON 但不符合我们的契约。
 *
 * 全部用 vi.stubGlobal('fetch') 造响应——不联网，也不需要任何 API Key。
 */

const CONFIG = {
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  model: 'test-model',
  platform: '测试平台',
};

/** 每个用例都新建实例：适配器会记住探到的降级形态，共用会串味 */
function makeService() {
  return new OpenAICompatibleAIService(CONFIG);
}

const ANALYZE_PAYLOAD = {
  ...MOCK_ANALYSIS,
  job_title: '产品经理（增长方向）',
  company: '字节跳动',
};

const analyzeInput = {
  resume: MOCK_RESUME_BEFORE,
  jdText: MOCK_JD_TEXT,
  baseScore: MOCK_BASE_SCORE,
};

function completion(content: string, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content }, ...extra }],
      usage: {
        prompt_tokens: 1200,
        completion_tokens: 340,
        prompt_tokens_details: { cached_tokens: 800 },
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function badRequest(message: string) {
  return new Response(JSON.stringify({ error: { message } }), { status: 400 });
}

/** 取第 n 次 fetch 的请求体 */
function requestBody(
  fetchMock: ReturnType<typeof vi.fn>,
  call: number,
): Record<string, unknown> {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('正常返回', () => {
  it('通过 Zod 校验并交出分析结果', async () => {
    const fetchMock = stubFetch(completion(JSON.stringify(ANALYZE_PAYLOAD)));

    const result = await makeService().analyze(analyzeInput);

    expect(result.match_score).toBe(ANALYZE_PAYLOAD.match_score);
    expect(result.job_title).toBe('产品经理（增长方向）');
    expect(result.suggestions).toHaveLength(MOCK_ANALYSIS.suggestions.length);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('打的是 {base_url}/chat/completions，带 Bearer 与 json_schema', async () => {
    const fetchMock = stubFetch(completion(JSON.stringify(ANALYZE_PAYLOAD)));

    await makeService().analyze(analyzeInput);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer sk-test',
    );

    const body = requestBody(fetchMock, 0);
    expect(body.model).toBe('test-model');
    expect(body.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'analyze_resume', strict: true },
    });
  });

  it('上报 token 用量，缓存读单独一项', async () => {
    stubFetch(completion(JSON.stringify(ANALYZE_PAYLOAD)));
    const onUsage = vi.fn();

    await makeService().analyze(analyzeInput, { onUsage });

    expect(onUsage).toHaveBeenCalledWith({
      inputTokens: 1200,
      outputTokens: 340,
      cacheReadTokens: 800,
    });
  });

  it('落不下去的建议被丢掉（和 Claude 那边同一道守卫）', async () => {
    // projects[9].lis[0] 在这份简历上无处安放
    const payload = {
      ...ANALYZE_PAYLOAD,
      suggestions: [
        ...MOCK_ANALYSIS.suggestions,
        {
          ...MOCK_ANALYSIS.suggestions[0],
          field_path: 'projects[9].lis[0]',
        },
      ],
    };
    stubFetch(completion(JSON.stringify(payload)));

    const result = await makeService().analyze(analyzeInput);

    expect(result.suggestions).toHaveLength(MOCK_ANALYSIS.suggestions.length);
    expect(
      result.suggestions.some((s) => s.field_path === 'projects[9].lis[0]'),
    ).toBe(false);
  });
});

describe('返回不合契约', () => {
  it('字段类型不对时抛 AIContractError', async () => {
    stubFetch(
      completion(JSON.stringify({ ...ANALYZE_PAYLOAD, match_score: '很高' })),
    );

    await expect(makeService().analyze(analyzeInput)).rejects.toBeInstanceOf(
      AIContractError,
    );
  });

  it('根本不是 JSON 时抛 AIContractError', async () => {
    stubFetch(completion('这不是 JSON'));

    await expect(makeService().analyze(analyzeInput)).rejects.toThrow(
      /不是合法 JSON/,
    );
  });

  it('输出被 max_tokens 截断时说清楚是截断', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'length', message: { content: '{"ma' } }],
        }),
        { status: 200 },
      ),
    );

    await expect(makeService().analyze(analyzeInput)).rejects.toThrow(/截断/);
  });
});

describe('json_schema 被拒后的降级', () => {
  it('400 之后退到 json_object，并把 schema 写进 system', async () => {
    const fetchMock = stubFetch(
      badRequest("Invalid parameter: 'response_format.json_schema' is not supported"),
      completion(JSON.stringify(ANALYZE_PAYLOAD)),
    );

    const result = await makeService().analyze(analyzeInput);

    expect(result.match_score).toBe(ANALYZE_PAYLOAD.match_score);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const retry = requestBody(fetchMock, 1);
    expect(retry.response_format).toEqual({ type: 'json_object' });

    // json_object 模式下端点不再按 schema 约束输出，schema 只能进提示词
    const messages = retry.messages as { role: string; content: string }[];
    const system = messages.find((m) => m.role === 'system')?.content ?? '';
    expect(system).toContain('JSON Schema');
    expect(system).toContain('match_score');
  });

  it('降级后模型包了 ```json 围栏也能解出来', async () => {
    stubFetch(
      badRequest('response_format json_schema unsupported'),
      completion('```json\n' + JSON.stringify(ANALYZE_PAYLOAD) + '\n```'),
    );

    const result = await makeService().analyze(analyzeInput);

    expect(result.match_score).toBe(ANALYZE_PAYLOAD.match_score);
  });

  it('探到一次就记住，同一实例的下次调用直接用 json_object', async () => {
    const fetchMock = stubFetch(
      badRequest('json_schema is not supported'),
      completion(JSON.stringify(ANALYZE_PAYLOAD)),
      completion(JSON.stringify(ANALYZE_PAYLOAD)),
    );
    const service = makeService();

    await service.analyze(analyzeInput);
    await service.analyze(analyzeInput);

    // 三次而不是四次：第二轮没有再撞一遍 400
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestBody(fetchMock, 2).response_format).toEqual({
      type: 'json_object',
    });
  });

  it('max_tokens 不被接受时改用 max_completion_tokens', async () => {
    const fetchMock = stubFetch(
      badRequest("Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens'"),
      completion(JSON.stringify(ANALYZE_PAYLOAD)),
    );

    await makeService().analyze(analyzeInput);

    expect(requestBody(fetchMock, 0)).toHaveProperty('max_tokens');
    const retry = requestBody(fetchMock, 1);
    expect(retry).toHaveProperty('max_completion_tokens');
    expect(retry).not.toHaveProperty('max_tokens');
    // 这次降级不该顺手把结构化输出也丢掉
    expect(retry.response_format).toMatchObject({ type: 'json_schema' });
  });

  it('报错文案没提 json_schema 也照样退一档试一次', async () => {
    // 不少兼容端点对不认识的字段只回一句「Invalid request」，
    // 靠关键词匹配就永远退不下去了
    const fetchMock = stubFetch(
      badRequest('Invalid request'),
      completion(JSON.stringify(ANALYZE_PAYLOAD)),
    );

    await makeService().analyze(analyzeInput);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(fetchMock, 1).response_format).toEqual({
      type: 'json_object',
    });
  });

  it('降级救不了的 400 抛出去，不无限重试', async () => {
    const fetchMock = stubFetch(
      badRequest('model not found'),
      badRequest('model not found'),
      completion(JSON.stringify(ANALYZE_PAYLOAD)),
    );

    await expect(makeService().analyze(analyzeInput)).rejects.toThrow(/400/);
    // 一次降级用光，第二个 400 就该抛了
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('降级之后仍然失败时，不把这个实例永久钉在 json_object 上', async () => {
    // 否则一次「型号名填错」的 400 会悄悄丢掉之后所有请求的结构化输出保证
    const fetchMock = stubFetch(
      badRequest('model not found'),
      badRequest('model not found'),
      completion(JSON.stringify(ANALYZE_PAYLOAD)),
    );
    const service = makeService();

    await expect(service.analyze(analyzeInput)).rejects.toThrow();
    await service.analyze(analyzeInput);

    expect(requestBody(fetchMock, 2).response_format).toMatchObject({
      type: 'json_schema',
    });
  });

  it('鉴权失败原样抛出，不当成降级信号', async () => {
    stubFetch(new Response('unauthorized', { status: 401 }));

    await expect(makeService().analyze(analyzeInput)).rejects.toThrow(/401/);
  });
});

describe('拒答', () => {
  it('finish_reason=content_filter 抛 AIRefusalError', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'content_filter', message: { content: null } }],
        }),
        { status: 200 },
      ),
    );

    await expect(makeService().analyze(analyzeInput)).rejects.toBeInstanceOf(
      AIRefusalError,
    );
  });

  it('结构化输出里的 message.refusal 同样算拒答', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          choices: [
            { finish_reason: 'stop', message: { refusal: '不能处理这类内容' } },
          ],
        }),
        { status: 200 },
      ),
    );

    const error = await makeService()
      .analyze(analyzeInput)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AIRefusalError);
    expect((error as AIRefusalError).category).toBe('不能处理这类内容');
  });

  it('拒答一样计费，用量照记', async () => {
    // 用量在读内容之前上报，否则「被拒答烧掉的 token」在后台就是隐形的
    stubFetch(
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'content_filter', message: {} }],
          usage: { prompt_tokens: 900, completion_tokens: 0 },
        }),
        { status: 200 },
      ),
    );
    const onUsage = vi.fn();

    await expect(
      makeService().analyze(analyzeInput, { onUsage }),
    ).rejects.toBeInstanceOf(AIRefusalError);

    expect(onUsage).toHaveBeenCalledWith({
      inputTokens: 900,
      outputTokens: 0,
      cacheReadTokens: 0,
    });
  });
});

describe('简历原件', () => {
  it('.docx 转出来的纯文本正常走通', async () => {
    const fetchMock = stubFetch(
      completion(
        JSON.stringify({ content: MOCK_RESUME_BEFORE, title: '简历.docx' }),
      ),
    );

    const result = await makeService().parseResume({
      filename: '简历.docx',
      mediaType: 'text/plain',
      data: Buffer.from('李婷\n产品经理\n……', 'utf8'),
    });

    expect(result.title).toBe('简历.docx');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['application/pdf', 'image/png'])(
    '%s 如实报不支持，并给出可执行的下一步',
    async (mediaType) => {
      const fetchMock = stubFetch();

      const error = await makeService()
        .parseResume({
          filename: '简历',
          mediaType,
          data: Buffer.from('%PDF-1.4'),
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AIUnsupportedInputError);
      expect((error as Error).message).toMatch(/Anthropic/);
      // 不装模作样地把二进制当文本发上去
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe('出网防护', () => {
  /**
   * 这个适配器是**每一次真实用户请求**都会走的路径，base_url 却来自后台的
   * 一个手填字段。写入时已经拦过一道，这里仍然要拦：库里可能存着防护上线
   * 之前写进去的旧行，而那一行会带着明文 API Key 被发往它指定的任何地址。
   */
  it('内网 base_url：一个包都不发', async () => {
    const fetchMock = stubFetch(completion(JSON.stringify(ANALYZE_PAYLOAD)));

    const service = new OpenAICompatibleAIService({
      ...CONFIG,
      baseUrl: 'http://169.254.169.254/v1',
    });

    await expect(service.analyze(analyzeInput)).rejects.toThrow(/内网|本机|https/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('不跟随重定向：3xx 直接失败', async () => {
    stubFetch(
      new Response('', { status: 302, headers: { location: 'http://169.254.169.254/' } }),
    );

    await expect(makeService().analyze(analyzeInput)).rejects.toThrow(/重定向/);
  });

  it('请求本身带上 redirect: manual', async () => {
    const fetchMock = stubFetch(completion(JSON.stringify(ANALYZE_PAYLOAD)));
    await makeService().analyze(analyzeInput);
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe('manual');
  });
});
