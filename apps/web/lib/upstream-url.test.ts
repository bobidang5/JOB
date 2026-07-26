import { afterEach, describe, expect, it } from 'vitest';

import {
  UnsafeUpstreamUrlError,
  allowsPrivateUpstream,
  assertUpstreamUrlAllowed,
  describeUnsafeUpstreamUrl,
  isPrivateAddress,
  isRedirect,
} from './upstream-url';

/**
 * base_url 的出网防护。
 *
 * 这些断言存在的理由不是「校验函数要有测试」，而是这个字段同时是 SSRF 入口
 * 和 API Key 的外带通道（见 upstream-url.ts 顶部）。放松其中任何一条，
 * 后果都是服务端带着明文密钥去访问一个别人指定的地址。
 */

const ENV = 'ADMIN_ALLOW_INSECURE_BASE_URL';

afterEach(() => {
  delete process.env[ENV];
});

describe('describeUnsafeUpstreamUrl', () => {
  it('放行正常的公网 https 端点', () => {
    for (const url of [
      'https://api.deepseek.com/v1',
      'https://api.openai.com/v1',
      'https://ark.cn-beijing.volces.com/api/v3',
      'https://api.anthropic.com',
    ]) {
      expect(describeUnsafeUpstreamUrl(url), url).toBeNull();
    }
  });

  it('空串放行——「不填」由调用方的必填规则去管', () => {
    expect(describeUnsafeUpstreamUrl('')).toBeNull();
    expect(describeUnsafeUpstreamUrl('   ')).toBeNull();
  });

  it('拒绝回环地址的各种写法', () => {
    for (const url of [
      'http://127.0.0.1:11434/v1',
      'https://127.0.0.1/v1',
      'https://127.1.2.3/v1',
      'https://localhost:8080/v1',
      'https://sub.localhost/v1',
      'https://[::1]:8080/v1',
      'https://0.0.0.0:8080/v1',
    ]) {
      expect(describeUnsafeUpstreamUrl(url), url).not.toBeNull();
    }
  });

  it('拒绝云元数据地址', () => {
    // 169.254.169.254 是 AWS/Azure/阿里云等的实例元数据端点，
    // 打到它就等于把服务器的临时凭据交出去
    expect(describeUnsafeUpstreamUrl('https://169.254.169.254/latest/meta-data')).not.toBeNull();
    expect(describeUnsafeUpstreamUrl('https://metadata.google.internal/x')).not.toBeNull();
  });

  it('拒绝 RFC1918 私网', () => {
    for (const url of [
      'https://10.0.0.1/v1',
      'https://172.16.0.1/v1',
      'https://172.31.255.254/v1',
      'https://192.168.1.1/v1',
    ]) {
      expect(describeUnsafeUpstreamUrl(url), url).not.toBeNull();
    }
  });

  it('172.32 不在私网段里，不该误伤', () => {
    expect(describeUnsafeUpstreamUrl('https://172.32.0.1/v1')).toBeNull();
  });

  it('拒绝整数形式的 IPv4（绕过点分十进制检查的常用手法）', () => {
    // http://2130706433/ 就是 http://127.0.0.1/
    expect(describeUnsafeUpstreamUrl('https://2130706433/v1')).not.toBeNull();
  });

  it('拒绝单标签主机名', () => {
    // 内网 DNS 会把短名补全成内部主机，公网端点不会长这样
    expect(describeUnsafeUpstreamUrl('https://internal-llm/v1')).not.toBeNull();
  });

  it('拒绝内网常见后缀', () => {
    for (const url of [
      'https://box.local/v1',
      'https://svc.internal/v1',
      'https://nas.home.arpa/v1',
    ]) {
      expect(describeUnsafeUpstreamUrl(url), url).not.toBeNull();
    }
  });

  it('拒绝明文 http（API Key 会以 Bearer 头裸奔）', () => {
    expect(describeUnsafeUpstreamUrl('http://api.deepseek.com/v1')).toContain('https');
  });

  it('拒绝 URL 里内嵌的凭据', () => {
    expect(describeUnsafeUpstreamUrl('https://user:pw@api.deepseek.com/v1')).not.toBeNull();
  });

  it('拒绝非 http(s) 的 scheme', () => {
    for (const url of ['file:///etc/passwd', 'gopher://x.com/', 'ftp://x.com/']) {
      expect(describeUnsafeUpstreamUrl(url), url).not.toBeNull();
    }
  });

  it('不是合法 URL 就直说', () => {
    expect(describeUnsafeUpstreamUrl('这不是地址')).toBe('接口地址不是合法的 URL');
  });

  it('逃生口打开后允许内网与 http（自建部署的正当用法）', () => {
    process.env[ENV] = '1';
    expect(allowsPrivateUpstream()).toBe(true);
    expect(describeUnsafeUpstreamUrl('http://127.0.0.1:11434/v1')).toBeNull();
    expect(describeUnsafeUpstreamUrl('http://192.168.1.50:8000/v1')).toBeNull();
    // scheme 与内嵌凭据不在逃生口的范围内，那两条任何时候都不成立
    expect(describeUnsafeUpstreamUrl('file:///etc/passwd')).not.toBeNull();
    expect(describeUnsafeUpstreamUrl('http://u:p@127.0.0.1/v1')).not.toBeNull();
  });

  it('逃生口默认关闭', () => {
    expect(allowsPrivateUpstream()).toBe(false);
  });
});

describe('assertUpstreamUrlAllowed', () => {
  it('字面量内网地址直接抛 UnsafeUpstreamUrlError', async () => {
    await expect(assertUpstreamUrlAllowed('https://169.254.169.254/x')).rejects.toBeInstanceOf(
      UnsafeUpstreamUrlError,
    );
  });

  it('域名解析到回环也要抛——字符串检查看不出这一种', async () => {
    // localhost 一定解析到 127.0.0.1 / ::1，是这台机器上唯一稳定可测的样本。
    // 逃生口打开时字符串那道会放行，于是走到的正是 DNS 那一步
    process.env[ENV] = '1';
    // 打开逃生口时 DNS 检查按设计整个跳过
    await expect(assertUpstreamUrlAllowed('http://localhost:1/v1')).resolves.toBeUndefined();

    delete process.env[ENV];
    await expect(assertUpstreamUrlAllowed('http://localhost:1/v1')).rejects.toBeInstanceOf(
      UnsafeUpstreamUrlError,
    );
  });

  it('正常的公网域名放行', async () => {
    await expect(assertUpstreamUrlAllowed('https://api.anthropic.com')).resolves.toBeUndefined();
  });
});

describe('isPrivateAddress', () => {
  it('认出各段私有地址', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.0.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '::1',
      '::',
      'fe80::1',
      'fd00::1',
      'ff02::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('公网地址不误伤', () => {
    for (const ip of ['1.1.1.1', '8.8.8.8', '104.18.0.1', '2606:4700::1111']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('认不出来的一律当不安全', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true);
    expect(isPrivateAddress('')).toBe(true);
  });
});

describe('isRedirect', () => {
  it('3xx 算重定向，其余不算', () => {
    for (const status of [301, 302, 303, 307, 308]) {
      expect(isRedirect(new Response(null, { status })), String(status)).toBe(true);
    }
    for (const status of [200, 400, 404, 500]) {
      expect(isRedirect(new Response(null, { status })), String(status)).toBe(false);
    }
  });
});
