import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ADMIN_COOKIE_NAME,
  issueSessionToken,
  readAdminSession,
  sessionSecret,
  signSessionToken,
  verifySessionToken,
  type AdminSessionPayload,
} from './session';

/**
 * 会话票据是后台的全部授权依据，所以这里逐条钉住「什么情况下必须失败」：
 * 换密钥、改签名、改 payload、过期、token_version 对不上。
 *
 * 其中 token_version 那条最容易在重构里丢掉——它是「改密后旧会话立刻
 * 失效」的唯一实现，而丢了它不会让任何功能测试变红：所有页面照常打开，
 * 只是被盗走的旧 cookie 永远有效。
 */

interface AdminRow {
  id: string;
  username: string;
  token_version: number;
  is_default_password: boolean;
}

// vi.mock 的工厂会被提升到 import 之前执行，直接引用模块作用域的变量会
// 撞上 TDZ；vi.hoisted 把这份状态一起提上去
const state = vi.hoisted(() => ({
  cookie: null as string | null,
  admin: null as AdminRow | null,
  dbError: null as { message: string } | null,
}));

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (state.cookie === null ? undefined : { name, value: state.cookie }),
    }),
}));

vi.mock('./db', () => ({
  adminDb: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: state.admin, error: state.dbError }),
        }),
      }),
    }),
  }),
}));

// 至少 32 个字符——sessionSecret() 会拒收更短的（短密钥能被离线爆破）
const SECRET = 'test-secret-用来签票据的那把-0123456789abcdef';
const OTHER_SECRET = 'another-secret-完全不同的一把-0123456789abcdef';

function payload(overrides: Partial<AdminSessionPayload> = {}): AdminSessionPayload {
  return {
    sub: '00000000-0000-4000-8000-000000000001',
    username: 'admin',
    tv: 3,
    exp: Math.floor(Date.now() / 1000) + 600,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv('ADMIN_SESSION_SECRET', SECRET);
  state.cookie = null;
  state.admin = null;
  state.dbError = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('签发与校验的往返', () => {
  it('签出来的票据能原样校验回来', () => {
    const original = payload();
    const parsed = verifySessionToken(signSessionToken(original));

    expect(parsed).toEqual(original);
  });

  it('票据是 base64url(payload).base64url(sig)，两段都不含需要转义的字符', () => {
    const token = signSessionToken(payload());
    const parts = token.split('.');

    expect(parts).toHaveLength(2);
    // base64url 的字母表就这些。带 + / = 的话进 cookie 还要再编码一次
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('issueSessionToken 按 8 小时算过期', () => {
    const token = issueSessionToken({ id: 'abc', username: 'admin', token_version: 7 });
    const parsed = verifySessionToken(token);

    expect(parsed?.sub).toBe('abc');
    expect(parsed?.tv).toBe(7);
    expect((parsed?.exp ?? 0) - Math.floor(Date.now() / 1000)).toBeGreaterThan(8 * 3600 - 5);
    expect((parsed?.exp ?? 0) - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(8 * 3600);
  });
});

describe('校验必须失败的情形', () => {
  it('签名改一个字节 → null', () => {
    const token = signSessionToken(payload());
    const [body, signature] = token.split('.') as [string, string];

    // 只换首字符，长度不变——长度对不上是另一回事，这里要测的是内容
    const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
    expect(flipped).not.toBe(signature);

    expect(verifySessionToken(`${body}.${flipped}`)).toBeNull();
  });

  it('payload 被改（哪怕改成一个合法的 payload）→ null', () => {
    const token = signSessionToken(payload({ tv: 3 }));
    const signature = token.split('.')[1] ?? '';

    // 攻击者把自己的 tv 改成任意值想绕过回查——签名是对整段 payload 算的，
    // 改了就对不上
    const forged = Buffer.from(JSON.stringify(payload({ tv: 999 })), 'utf8').toString('base64url');

    expect(verifySessionToken(`${forged}.${signature}`)).toBeNull();
  });

  it('用别的密钥签的票据 → null', () => {
    const token = signSessionToken(payload(), Buffer.from(OTHER_SECRET, 'utf8'));

    expect(verifySessionToken(token)).toBeNull();
    // 反过来用那把密钥当然是能验的，说明失败的原因确实是密钥不同
    expect(verifySessionToken(token, Buffer.from(OTHER_SECRET, 'utf8'))).not.toBeNull();
  });

  it('过期的票据 → null', () => {
    const expired = signSessionToken(payload({ exp: Math.floor(Date.now() / 1000) - 1 }));

    expect(expired.split('.')).toHaveLength(2);
    expect(verifySessionToken(expired)).toBeNull();
  });

  it('结构不对的字符串 → null，且不抛异常', () => {
    const garbage = [
      '',
      '.',
      'onlyonepart',
      'a.b.c',
      `${Buffer.from('not json', 'utf8').toString('base64url')}.AAAA`,
      // 签名段是空的
      `${Buffer.from(JSON.stringify(payload()), 'utf8').toString('base64url')}.`,
    ];

    for (const token of garbage) {
      expect(() => verifySessionToken(token)).not.toThrow();
      expect(verifySessionToken(token)).toBeNull();
    }
  });

  it('签名合法但 payload 少字段 → null', () => {
    // 换过 payload 结构的旧票据不能以 undefined 的形式漏进下游
    const body = Buffer.from(JSON.stringify({ sub: 'x' }), 'utf8').toString('base64url');
    const token = signSessionToken(payload());
    const forged = `${body}.${token.split('.')[1] ?? ''}`;

    expect(verifySessionToken(forged)).toBeNull();
  });
});

describe('sessionSecret', () => {
  it('配了就用配的那把', () => {
    expect(sessionSecret().toString('utf8')).toBe(SECRET);
  });

  it('生产环境没配就抛，绝不回退到内置默认值', () => {
    vi.stubEnv('ADMIN_SESSION_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');

    // 一把写在仓库里的默认密钥等于公开密钥，任何人都能自己签票据进后台
    expect(() => sessionSecret()).toThrow(/ADMIN_SESSION_SECRET/);
  });

  it('配了但太短一样抛——短密钥和没有密钥是一回事', () => {
    for (const weak of ['secret', 'changeme', 'admin', 'a'.repeat(31)]) {
      vi.stubEnv('ADMIN_SESSION_SECRET', weak);
      // 生产与开发都要抛：开发环境用一把弱密钥，很容易一路带到线上
      vi.stubEnv('NODE_ENV', 'development');
      expect(() => sessionSecret(), weak).toThrow(/太短/);
      vi.stubEnv('NODE_ENV', 'production');
      expect(() => sessionSecret(), weak).toThrow(/太短/);
    }
  });

  it('刚好 32 个字符可以过', () => {
    vi.stubEnv('ADMIN_SESSION_SECRET', 'a'.repeat(32));
    expect(sessionSecret()).toHaveLength(32);
  });

  it('非生产环境没配则临时生成一把，并打 warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('ADMIN_SESSION_SECRET', '');
    vi.stubEnv('NODE_ENV', 'development');

    const generated = sessionSecret();

    expect(generated).toHaveLength(32);
    // 同一进程内必须是同一把，否则刚签的票据下一秒就验不过
    expect(sessionSecret().equals(generated)).toBe(true);
    expect(warn).toHaveBeenCalled();
  });
});

describe('readAdminSession 的 token_version 回查', () => {
  const admin: AdminRow = {
    id: '00000000-0000-4000-8000-000000000001',
    username: 'admin',
    token_version: 3,
    is_default_password: true,
  };

  it('没有 cookie → null', async () => {
    state.admin = admin;

    await expect(readAdminSession()).resolves.toBeNull();
  });

  it('票据有效且 tv 一致 → 返回会话，带上 is_default_password', async () => {
    state.admin = admin;
    state.cookie = signSessionToken(payload({ sub: admin.id, tv: 3 }));

    await expect(readAdminSession()).resolves.toEqual({
      id: admin.id,
      username: 'admin',
      tokenVersion: 3,
      isDefaultPassword: true,
    });
  });

  it('tv 对不上 → null（改密后旧票据立刻失效）', async () => {
    // 票据是改密之前签的，库里已经涨到 4
    state.cookie = signSessionToken(payload({ sub: admin.id, tv: 3 }));
    state.admin = { ...admin, token_version: 4 };

    await expect(readAdminSession()).resolves.toBeNull();
  });

  it('管理员被删 → null', async () => {
    state.cookie = signSessionToken(payload({ sub: admin.id, tv: 3 }));
    state.admin = null;

    await expect(readAdminSession()).resolves.toBeNull();
  });

  it('数据库查不动 → null，不放行', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.cookie = signSessionToken(payload({ sub: admin.id, tv: 3 }));
    state.admin = admin;
    state.dbError = { message: 'connection refused' };

    // 核实不了就当没登录：一次数据库抖动不该变成一次放行
    await expect(readAdminSession()).resolves.toBeNull();
    expect(log).toHaveBeenCalled();
  });

  it('签名对不上时根本不查库 → null', async () => {
    state.cookie = signSessionToken(payload({ sub: admin.id, tv: 3 }), Buffer.from(OTHER_SECRET));
    state.admin = admin;

    await expect(readAdminSession()).resolves.toBeNull();
  });

  it('cookie 名字是约定的那个', () => {
    // middleware.ts 里有一份硬编码的副本（Edge runtime 不 import 这个模块），
    // 改名时两处要一起改
    expect(ADMIN_COOKIE_NAME).toBe('zhiyou_admin');
  });
});
