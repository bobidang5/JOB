import { describe, expect, it } from 'vitest';

import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password';

/**
 * 口令哈希是后台唯一的身份凭据，这里钉三件事：
 *   1. 自己生成的哈希能被自己校验回来；
 *   2. 迁移里那串出厂哈希确实对应 abc123——这是「出厂管理员能登录」的
 *      唯一证据，两边（SQL 和 TS）任何一方改了参数都会在这儿变红；
 *   3. 各种畸形输入一律返回 false，绝不抛异常。抛异常会把登录接口的 401
 *      变成 500，而这两者的差别本身就是可观测的信息。
 */

/** 与 supabase/migrations/20260726000200_admin_console.sql 里那一行逐字节一致 */
const FACTORY_HASH =
  'scrypt$16384$8$1$Ra0rAqMrjUDqRjdyZDw4Aw==$EYkcO33hRjCgLUEOyqwxDmb0LQVoSTbbgSbBAHLNhzQ=';

describe('hashPassword', () => {
  it('生成的串是 scrypt$N$r$p$salt$hash，参数就是约定的那套', () => {
    const stored = hashPassword('correct horse battery staple');
    const parts = stored.split('$');

    expect(parts).toHaveLength(6);
    expect(parts.slice(0, 4)).toEqual(['scrypt', '16384', '8', '1']);
    expect(Buffer.from(parts[4] ?? '', 'base64')).toHaveLength(16);
    expect(Buffer.from(parts[5] ?? '', 'base64')).toHaveLength(32);
  });

  it('同一个口令每次哈希都不同——salt 是随机的', () => {
    // 固定 salt 会让「两个管理员用了同一个口令」这件事从库里一眼看出来，
    // 也让彩虹表重新变得有意义
    expect(hashPassword('abc123')).not.toBe(hashPassword('abc123'));
  });

  it('往返：生成的哈希能校验通过', () => {
    const stored = hashPassword('a-very-long-passphrase-🙂');
    expect(verifyPassword('a-very-long-passphrase-🙂', stored)).toBe(true);
  });
});

describe('verifyPassword 对出厂口令', () => {
  it('迁移里那串哈希 + abc123 校验通过', () => {
    expect(verifyPassword('abc123', FACTORY_HASH)).toBe(true);
  });

  it('差一个字符就不通过', () => {
    expect(verifyPassword('abc124', FACTORY_HASH)).toBe(false);
    expect(verifyPassword('abc12', FACTORY_HASH)).toBe(false);
    expect(verifyPassword('abc1234', FACTORY_HASH)).toBe(false);
    expect(verifyPassword('ABC123', FACTORY_HASH)).toBe(false);
    expect(verifyPassword('', FACTORY_HASH)).toBe(false);
  });
});

describe('verifyPassword 对被篡改的哈希串', () => {
  it('改哈希段里的一个字符 → false', () => {
    // 把 base64 的首字符 E 换成 F：仍然是合法 base64，只是内容不同了
    const tampered = FACTORY_HASH.replace('$EYkc', '$FYkc');
    expect(tampered).not.toBe(FACTORY_HASH);
    expect(verifyPassword('abc123', tampered)).toBe(false);
  });

  it('换 salt → false', () => {
    const tampered = FACTORY_HASH.replace('Ra0r', 'Rb0r');
    expect(verifyPassword('abc123', tampered)).toBe(false);
  });

  it('调小 N 想让爆破变便宜 → false（参数是被签在串里一起比的）', () => {
    const weakened = FACTORY_HASH.replace('$16384$', '$2$');
    expect(verifyPassword('abc123', weakened)).toBe(false);
  });
});

describe('verifyPassword 对格式非法的串', () => {
  const malformed = [
    '',
    'abc123',
    'scrypt',
    'scrypt$16384$8$1',
    'scrypt$16384$8$1$$',
    'scrypt$16384$8$1$Ra0rAqMrjUDqRjdyZDw4Aw==',
    'scrypt$16384$8$1$Ra0rAqMrjUDqRjdyZDw4Aw==$EYkc$extra',
    // 换个算法名：不能因为「后面几段格式对」就认下来
    'bcrypt$16384$8$1$Ra0rAqMrjUDqRjdyZDw4Aw==$EYkcO33hRjCgLUEOyqwxDmb0LQVoSTbbgSbBAHLNhzQ=',
    // N 不是 2 的幂，scryptSync 会直接抛
    'scrypt$16383$8$1$Ra0rAqMrjUDqRjdyZDw4Aw==$EYkcO33hRjCgLUEOyqwxDmb0LQVoSTbbgSbBAHLNhzQ=',
    // 参数大到能把进程的内存吃光——必须在跑之前就被挡下来
    'scrypt$1048576$32$1$Ra0rAqMrjUDqRjdyZDw4Aw==$EYkcO33hRjCgLUEOyqwxDmb0LQVoSTbbgSbBAHLNhzQ=',
    'scrypt$0$8$1$Ra0rAqMrjUDqRjdyZDw4Aw==$EYkcO33hRjCgLUEOyqwxDmb0LQVoSTbbgSbBAHLNhzQ=',
    'scrypt$16384$-8$1$Ra0rAqMrjUDqRjdyZDw4Aw==$EYkcO33hRjCgLUEOyqwxDmb0LQVoSTbbgSbBAHLNhzQ=',
    'scrypt$16384$8$1$!!!!$EYkcO33hRjCgLUEOyqwxDmb0LQVoSTbbgSbBAHLNhzQ=',
    // 哈希段只有 3 字节：长度不等时不能提前 return，也不能让
    // timingSafeEqual 抛出来
    'scrypt$16384$8$1$Ra0rAqMrjUDqRjdyZDw4Aw==$AAAA',
  ];

  it.each(malformed)('%j → false，不抛异常', (stored) => {
    expect(() => verifyPassword('abc123', stored)).not.toThrow();
    expect(verifyPassword('abc123', stored)).toBe(false);
  });
});

describe('DUMMY_PASSWORD_HASH', () => {
  it('格式与真串一致，但任何口令都对不上', () => {
    const parts = DUMMY_PASSWORD_HASH.split('$');

    // 格式必须合法，否则 verifyPassword 会走进「解析失败」的兜底分支，
    // 那条分支用的是默认参数，和真串的耗时未必对得上
    expect(parts.slice(0, 4)).toEqual(['scrypt', '16384', '8', '1']);
    expect(Buffer.from(parts[4] ?? '', 'base64')).toHaveLength(16);
    expect(Buffer.from(parts[5] ?? '', 'base64')).toHaveLength(32);

    expect(verifyPassword('abc123', DUMMY_PASSWORD_HASH)).toBe(false);
    expect(verifyPassword('', DUMMY_PASSWORD_HASH)).toBe(false);
  });
});
