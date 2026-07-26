import { randomBytes } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decryptSecret, encryptSecret, maskKey } from './secrets';

/**
 * 这一层的价值全在「解不开的时候必须解不开」。
 *
 * 往返测试只能证明它是个能用的编解码器；真正要钉死的是 GCM 认证标签的
 * 那个性质——密文任何一段被改过，解密都要失败而不是吐出一段垃圾明文。
 * 少了这条，一个被篡改的 api_key_cipher 会变成一次莫名其妙的上游 401，
 * 排查时根本想不到是数据被动过。
 */

const KEY = randomBytes(32).toString('base64');

beforeEach(() => {
  vi.stubEnv('SETTINGS_ENCRYPTION_KEY', KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** 把密文第 index 段（0=版本 1=iv 2=tag 3=密文）的第一个字节翻掉 */
function tamper(cipher: string, index: 1 | 2 | 3): string {
  const parts = cipher.split('.');
  const bytes = Buffer.from(parts[index] as string, 'base64url');
  bytes[0] = (bytes[0] as number) ^ 0xff;
  parts[index] = bytes.toString('base64url');
  return parts.join('.');
}

describe('encryptSecret / decryptSecret', () => {
  it('加解密往返得到原文', () => {
    const plain = 'sk-ant-api03-0123456789abcdef';

    expect(decryptSecret(encryptSecret(plain))).toBe(plain);
  });

  it('中文和长文本也能往返', () => {
    const plain = `密钥-${'x'.repeat(500)}-结尾`;

    expect(decryptSecret(encryptSecret(plain))).toBe(plain);
  });

  it('密文形如 v1.<iv>.<tag>.<ciphertext>，且不含明文', () => {
    const plain = 'sk-secret-value';
    const cipher = encryptSecret(plain);
    const parts = cipher.split('.');

    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v1');
    expect(cipher).not.toContain(plain);
    // base64url 不含这三个字符，拼进 URL / 日志都不用转义
    expect(cipher).not.toMatch(/[+/=]/);
  });

  it('同一明文两次加密得到不同密文（iv 是随机的）', () => {
    const plain = 'sk-same-input';

    expect(encryptSecret(plain)).not.toBe(encryptSecret(plain));
  });

  it.each([
    ['iv', 1],
    ['tag', 2],
    ['ciphertext', 3],
  ] as const)('篡改 %s 段就解不开', (_label, index) => {
    const cipher = encryptSecret('sk-secret-value');

    expect(() => decryptSecret(tamper(cipher, index))).toThrow();
  });

  it('换一把密钥也解不开', () => {
    const cipher = encryptSecret('sk-secret-value');

    vi.stubEnv('SETTINGS_ENCRYPTION_KEY', randomBytes(32).toString('base64'));

    expect(() => decryptSecret(cipher)).toThrow(/解不开/);
  });

  it.each([
    'v1.only.three',
    'v2.aaaa.bbbb.cccc',
    '',
    'not-a-cipher',
  ])('格式不对的输入直接报格式错：%s', (bad) => {
    expect(() => decryptSecret(bad)).toThrow(/密文格式不对/);
  });
});

describe('主密钥缺失或不合法', () => {
  it('没设 SETTINGS_ENCRYPTION_KEY 就抛错，并给出生成命令', () => {
    vi.stubEnv('SETTINGS_ENCRYPTION_KEY', '');

    // 不能有任何默认值或随机兜底：静态加密的密钥一变，已存的 key 全部作废
    expect(() => encryptSecret('x')).toThrow(/openssl rand -base64 32/);
  });

  it('长度不足 32 字节时报出实际长度', () => {
    vi.stubEnv('SETTINGS_ENCRYPTION_KEY', randomBytes(16).toString('base64'));

    expect(() => encryptSecret('x')).toThrow(/16 字节/);
  });
});

describe('maskKey', () => {
  it('取后 4 位', () => {
    expect(maskKey('sk-ant-api03-abcd1234')).toBe('1234');
  });

  it.each(['abc', 'ab', 'a', ''])('短于 4 位时原样返回不越界：%s', (short) => {
    const masked = maskKey(short);

    expect(masked).toBe(short);
    // api_key_last4 上有 char_length <= 4 的约束
    expect(masked.length).toBeLessThanOrEqual(4);
  });
});
