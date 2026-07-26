import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * ai_providers.api_key_cipher 的加解密。
 *
 * 静态加密（encryption at rest）：明文 API key 既不进 git，也不以明文躺在
 * 数据库里。这不能防住「能读到应用环境变量的人」——那个人拿到
 * SETTINGS_ENCRYPTION_KEY 就能解开一切——它防的是数据库备份、只读副本、
 * 误导出的 dump 这几条泄漏路径，那才是运营后台最现实的风险。
 *
 * 用 AES-256-GCM 而不是 CBC：GCM 自带认证标签，密文被改一个字节就解不开，
 * 所以「密文被篡改」和「密钥不对」在这里是同一类错误，不需要额外的 MAC。
 *
 * 密文格式：v1.<iv>.<tag>.<ciphertext>，四段用 '.' 连接，后三段是 base64url。
 * 开头带版本号是为了以后换算法时能分辨老密文；base64url 不含 '+' '/' '='，
 * 拼进 URL、日志、JSON 都不用再转义。
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
/** GCM 的标准 nonce 长度。12 字节是 NIST 推荐值，也是 node 的默认 */
const IV_BYTES = 12;
const TAG_BYTES = 16;

const KEY_ENV = 'SETTINGS_ENCRYPTION_KEY';

const MISSING_KEY_MESSAGE =
  `缺少 ${KEY_ENV}。这是静态加密的主密钥，用这条命令生成一次、` +
  '写进环境变量后就不要再改：\n' +
  '  openssl rand -base64 32\n' +
  '（密钥一旦更换，已经存进 ai_providers 的 API key 全部永久解不开，' +
  '只能在后台重新填一遍。）';

/**
 * 读主密钥。
 *
 * **刻意不提供任何默认值，也不在缺失时随机生成一把。** 随机兜底在这里是
 * 最坏的选择：进程重启就换一把新的，之前存的密文全部作废，而且故障要等到
 * 用户真的去调模型时才暴露。缺就直接抛，让它在配置阶段就响。
 *
 * 每次调用都重新读 env（而不是模块加载时读一次）：Next.js 的 env 注入
 * 时机与模块求值顺序不完全一致，读晚一点更稳，代价只是一次 base64 解码。
 */
function loadKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) throw new Error(MISSING_KEY_MESSAGE);

  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    throw new Error(`${KEY_ENV} 不是合法的 base64。${MISSING_KEY_MESSAGE}`);
  }

  // Buffer.from(…, 'base64') 对非法字符是静默丢弃而不是报错，所以长度校验
  // 是唯一能发现「填了个短串」的地方
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `${KEY_ENV} 解码后是 ${key.length} 字节，AES-256 需要 ${KEY_BYTES} 字节。\n` +
        MISSING_KEY_MESSAGE,
    );
  }

  return key;
}

/** 明文 API key → v1.<iv>.<tag>.<ciphertext> */
export function encryptSecret(plain: string): string {
  if (!plain) throw new Error('不能加密空字符串');

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, loadKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * v1.<iv>.<tag>.<ciphertext> → 明文。
 *
 * 任何一段被改动都会在 decipher.final() 抛出（GCM 认证标签的作用），
 * 这里统一转成一句人话——调用方拿到的信息量不该区分「标签对不上」和
 * 「密钥不对」，那属于给攻击者的提示。
 */
export function decryptSecret(cipher: string): string {
  const parts = cipher.split('.');
  const [version, ivPart, tagPart, bodyPart] = parts;
  if (
    parts.length !== 4 ||
    version !== VERSION ||
    ivPart === undefined ||
    tagPart === undefined ||
    bodyPart === undefined
  ) {
    throw new Error('密文格式不对，期望 v1.<iv>.<tag>.<ciphertext>');
  }

  const iv = Buffer.from(ivPart, 'base64url');
  const tag = Buffer.from(tagPart, 'base64url');
  const body = Buffer.from(bodyPart, 'base64url');

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('密文格式不对，iv 或 tag 长度异常');
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, loadKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString(
      'utf8',
    );
  } catch {
    throw new Error(
      '密文解不开：要么它被改过，要么 ' +
        KEY_ENV +
        ' 和加密时用的不是同一把。后者只能在后台重新填一次 API key。',
    );
  }
}

/**
 * 取后 4 位存进 api_key_last4，后台列表显示成 ****1234。
 *
 * 只是给人核对「填的是哪把 key」用的，不是脱敏保护——真正的保护是明文
 * 从不出库。短于 4 位时原样返回，不补位也不越界（DB 上的约束是 <= 4）。
 */
export function maskKey(plain: string): string {
  return plain.slice(-4);
}
