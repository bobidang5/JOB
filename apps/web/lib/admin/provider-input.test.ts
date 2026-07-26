import { describe, expect, it } from 'vitest';

import {
  CreateProviderSchema,
  UpdateProviderSchema,
  baseUrlRuleError,
} from './provider-input';

/**
 * 这组用例盯的是三件会变成线上事故的事：
 *   - openai_compatible 没有 base_url 时能不能在应用层就被挡下（不然用户看到
 *     的是一句数据库约束名）；
 *   - PATCH 的 api_key 允不允许空串（空串必须能过校验，路由才有机会把它解释
 *     成「不改 key」；这里挡下来的话，编辑表单永远提交不了）；
 *   - Zod 的报错里会不会把用户填的值回显出去（lib/http.ts 把 issues 原样回传，
 *     那是一条能把 API Key 送出服务端的路径）。
 */

const VALID = {
  label: 'DeepSeek 生产',
  platform: 'deepseek',
  model: 'deepseek-chat',
  base_url: 'https://api.deepseek.com/v1',
  api_key: 'sk-secret-value-1234',
};

describe('baseUrlRuleError', () => {
  it('openai_compatible 缺 base_url 时报错', () => {
    expect(baseUrlRuleError('deepseek', '')).toMatch(/必须填写接口地址/);
    expect(baseUrlRuleError('deepseek', '   ')).toMatch(/必须填写接口地址/);
  });

  it('anthropic 允许留空（走官方端点）', () => {
    expect(baseUrlRuleError('anthropic', '')).toBeNull();
  });

  it('未知平台按 openai_compatible 处理，仍然要求 base_url', () => {
    // 历史行的 platform 可能已经从 catalog 里删掉了。要求填地址是更安全的一边
    expect(baseUrlRuleError('some-removed-platform', '')).toMatch(/必须填写接口地址/);
  });

  it('只接受 http/https', () => {
    expect(baseUrlRuleError('deepseek', 'https://api.deepseek.com/v1')).toBeNull();
    expect(baseUrlRuleError('deepseek', 'ftp://api.deepseek.com')).toMatch(/http/);
    expect(baseUrlRuleError('deepseek', 'file:///etc/passwd')).toMatch(/http/);
    expect(baseUrlRuleError('deepseek', 'api.deepseek.com/v1')).toMatch(/不是合法的 URL/);
  });

  /**
   * 出网防护接在这条规则后面。
   *
   * 详细的分段判断在 lib/upstream-url.test.ts 里，这里只钉住「这条路径确实
   * 接上了」——base_url 会被服务端拿去发请求，还带着明文 API Key，
   * 是 SSRF 入口也是密钥外带通道。
   */
  it('不许把地址指向内网、回环或云元数据', () => {
    expect(baseUrlRuleError('deepseek', 'http://127.0.0.1:8000/v1')).not.toBeNull();
    expect(baseUrlRuleError('deepseek', 'https://169.254.169.254/latest')).toMatch(/内网/);
    expect(baseUrlRuleError('deepseek', 'https://10.0.0.5/v1')).toMatch(/内网/);
    expect(baseUrlRuleError('anthropic', 'https://192.168.1.1')).toMatch(/内网/);
  });

  it('明文 http 也拦：Bearer 头里的 API Key 会裸奔', () => {
    expect(baseUrlRuleError('deepseek', 'http://api.deepseek.com/v1')).toMatch(/https/);
  });

  it('anthropic 填了地址也要是合法 URL', () => {
    expect(baseUrlRuleError('anthropic', 'https://relay.example.com')).toBeNull();
    expect(baseUrlRuleError('anthropic', '随便写点什么')).toMatch(/不是合法的 URL/);
  });
});

describe('CreateProviderSchema', () => {
  it('接受一份完整配置，并顺手 trim', () => {
    const parsed = CreateProviderSchema.parse({
      ...VALID,
      label: '  DeepSeek 生产  ',
      model: '  deepseek-chat\n',
    });
    expect(parsed.label).toBe('DeepSeek 生产');
    expect(parsed.model).toBe('deepseek-chat');
  });

  it('平台必须在 catalog 里', () => {
    expect(CreateProviderSchema.safeParse({ ...VALID, platform: 'openai' }).success).toBe(true);
    expect(CreateProviderSchema.safeParse({ ...VALID, platform: '自己写的' }).success).toBe(false);
  });

  it('新建必须给 API Key', () => {
    expect(CreateProviderSchema.safeParse({ ...VALID, api_key: '' }).success).toBe(false);
    expect(
      CreateProviderSchema.safeParse({
        label: VALID.label,
        platform: VALID.platform,
        model: VALID.model,
        base_url: VALID.base_url,
      }).success,
    ).toBe(false);
  });

  it('把 base_url 规则挂在 base_url 这个字段上', () => {
    const result = CreateProviderSchema.safeParse({ ...VALID, base_url: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['base_url']);
  });

  it('anthropic 不填 base_url 也能过', () => {
    const result = CreateProviderSchema.safeParse({
      label: 'Claude',
      platform: 'anthropic',
      model: 'claude-opus-5',
      api_key: 'sk-ant-xxx',
    });
    expect(result.success).toBe(true);
  });

  it('effort 只认那五档', () => {
    expect(CreateProviderSchema.safeParse({ ...VALID, effort: 'xhigh' }).success).toBe(true);
    expect(CreateProviderSchema.safeParse({ ...VALID, effort: 'ultra' }).success).toBe(false);
  });

  /**
   * 这条是安全用例，不是形式校验。
   *
   * lib/http.ts 的 errorResponse 会把 ZodError 的 issues 整个放进响应体。要是
   * Zod 在 issue 里带上了出错字段的原值，一次「key 太长」的校验失败就会把
   * API Key 原样回显给浏览器。Zod v4 目前不带，这条用例负责在它哪天带上时
   * 立刻把警报拉响。
   */
  it('校验失败时不回显用户填的值', () => {
    const secret = 'sk-super-secret-key-value';
    const result = CreateProviderSchema.safeParse({
      ...VALID,
      api_key: secret.repeat(40), // 超过 512 上限
      label: '',
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).not.toContain(secret);
  });
});

describe('UpdateProviderSchema', () => {
  it('全部字段可选，空对象也算合法（等于什么都不改）', () => {
    expect(UpdateProviderSchema.safeParse({}).success).toBe(true);
  });

  it('api_key 允许空串——那是「不修改」的表达方式', () => {
    // 编辑表单里那个密码框默认就是空的（key 从来没发给过浏览器），
    // 这里如果按 min(1) 卡住，改个名字都提交不了
    expect(UpdateProviderSchema.safeParse({ api_key: '' }).success).toBe(true);
  });

  it('只切换启用状态也合法', () => {
    const parsed = UpdateProviderSchema.parse({ is_active: true });
    expect(parsed.is_active).toBe(true);
    expect(parsed.label).toBeUndefined();
  });

  it('给了的字段照样要合规', () => {
    expect(UpdateProviderSchema.safeParse({ label: '' }).success).toBe(false);
    expect(UpdateProviderSchema.safeParse({ platform: '瞎写的' }).success).toBe(false);
  });
});
