import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * 管理员口令的哈希与校验。
 *
 * 用 node:crypto 自带的 scrypt，不装 bcrypt/argon2：那两个都是原生扩展，
 * 为了一张只有一行数据的 admin_users 表往部署里塞一个要编译的依赖不划算。
 * scrypt 是内存硬的 KDF，抗 GPU/ASIC 批量爆破的能力足够撑住一个内部后台。
 *
 * 串格式 `scrypt$N$r$p$base64(salt)$base64(hash)`，参数跟着哈希一起存。
 * 这样以后调大 N 时，老口令仍然能用它自己那套参数校验通过，不需要先把
 * 所有人的哈希重算一遍——而重算是做不到的，我们手里没有明文。
 */

const SCHEME = 'scrypt';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

/**
 * scryptSync 默认 maxmem 是 32MB，而 N=16384 r=8 需要 128*N*r = 16MB，
 * 余量只剩一倍。显式放宽到 64MB，免得以后调参数时撞上默认上限直接抛异常
 * ——那会让一次「校验失败」变成一次 500。
 */
const MAX_MEMORY_BYTES = 64 * 1024 * 1024;

interface ScryptParams {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

/**
 * 一条格式合法、但谁的口令都对不上的哈希串。
 *
 * 登录路由在「用户名不存在」时拿它跑一次 verifyPassword，让两条失败路径
 * 的耗时落在同一个量级上；否则「查不到用户就立刻返回」等于把哪些用户名
 * 存在直接写进了响应时间里。
 *
 * 不去真哈希一个随机口令：salt 和 hash 都取随机字节，格式和参数与真串
 * 完全一致，校验时付出的计算也完全一致，但省掉了进程启动时的一次 scrypt。
 */
export const DUMMY_PASSWORD_HASH = [
  SCHEME,
  SCRYPT_N,
  SCRYPT_R,
  SCRYPT_P,
  randomBytes(SALT_BYTES).toString('base64'),
  randomBytes(KEY_BYTES).toString('base64'),
].join('$');

/** 生成 `scrypt$N$r$p$salt$hash`。每次调用换一把随机 salt。 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(plain, salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEMORY_BYTES,
  });

  return [
    SCHEME,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

/**
 * 校验口令。
 *
 * 对任何输入都只返回 true/false，绝不抛异常：这个函数在登录路由的失败
 * 分支上也会被调用，一次意外抛出会把 401 变成 500，而 500 和 401 的差别
 * 本身就是一条可观测的信息。
 */
export function verifyPassword(plain: string, stored: string): boolean {
  const parsed = parseStored(stored);

  /*
   * 解析不出来的串（数据被改坏、或者根本不是这个格式）同样要付掉一次
   * 同等量级的计算再返回 false。理由同 DUMMY_PASSWORD_HASH：任何一条能
   * 提前返回的快路径，都会把「这条记录长什么样」暴露成响应时间上的差异。
   */
  const params = parsed ?? fallbackParams();

  try {
    /*
     * 派生长度取自存储串里那段哈希的实际长度，于是两个 Buffer 的长度
     * 天然一致。这既让 timingSafeEqual 不会因为长度不同而抛异常，也免掉了
     * 「长度不等就 return false」那种提前退出——那种写法会在口令还没比完
     * 之前就把结果泄露在耗时里。
     */
    const derived = scryptSync(plain, params.salt, params.hash.length, {
      N: params.N,
      r: params.r,
      p: params.p,
      maxmem: MAX_MEMORY_BYTES,
    });

    const matches = timingSafeEqual(derived, params.hash);

    // 先比完再看解析结果：解析失败时上面那次计算才不是白跑的
    return parsed !== null && matches;
  } catch {
    return false;
  }
}

/** 解析失败时用的参数，取当前默认值 + 一把随机 salt，成本与真串相同。 */
function fallbackParams(): ScryptParams {
  return {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    salt: randomBytes(SALT_BYTES),
    hash: Buffer.alloc(KEY_BYTES),
  };
}

/**
 * 解析存储串。任何一处不合法都返回 null。
 *
 * 这里做的是格式与参数的合法性检查，不涉及任何秘密的比较，所以提前返回
 * 不泄露信息——调用方仍然会替它补上一次等价的计算。
 */
function parseStored(stored: string): ScryptParams | null {
  if (typeof stored !== 'string') return null;

  const parts = stored.split('$');
  if (parts.length !== 6) return null;

  const [scheme, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  if (scheme !== SCHEME) return null;
  if (rawN === undefined || rawR === undefined || rawP === undefined) return null;
  if (rawSalt === undefined || rawHash === undefined) return null;

  const N = parsePositiveInt(rawN);
  const r = parsePositiveInt(rawR);
  const p = parsePositiveInt(rawP);
  if (N === null || r === null || p === null) return null;

  // scrypt 要求 N 是大于 1 的 2 的幂；不先挡住的话 scryptSync 会抛
  if (N < 2 || N > 2 ** 20 || (N & (N - 1)) !== 0) return null;
  if (r < 1 || r > 32) return null;
  if (p < 1 || p > 16) return null;

  // 参数是从数据库读出来的。万一那一行被写坏成 N=2^20 r=32，
  // 一次校验就要吃掉几个 GB——校验失败远好过把进程拖垮
  if (128 * N * r > MAX_MEMORY_BYTES) return null;

  const salt = decodeBase64(rawSalt);
  const hash = decodeBase64(rawHash);
  if (salt === null || hash === null) return null;
  if (salt.length < 8 || salt.length > 64) return null;
  if (hash.length < 16 || hash.length > 64) return null;

  return { N, r, p, salt, hash };
}

function parsePositiveInt(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Buffer.from(x, 'base64') 会默默丢掉非法字符，`!!!!` 也能「解码成功」。
 * 回编一次比对，把被截断/被改过格式的串挡在外面。
 */
function decodeBase64(value: string): Buffer | null {
  if (value.length === 0) return null;
  const decoded = Buffer.from(value, 'base64');
  return decoded.toString('base64') === value ? decoded : null;
}
