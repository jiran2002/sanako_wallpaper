import crypto from 'node:crypto';

const KEY_LEN = 64;

/** 使用 scrypt 生成密码哈希，格式：scrypt$<salt>$<hash> */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, KEY_LEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/** 校验密码 */
export function verifyPassword(password, stored) {
  const [algo, salt, hash] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  let expected;
  try {
    expected = Buffer.from(hash, 'hex');
  } catch {
    return false;
  }
  const actual = crypto.scryptSync(String(password), salt, expected.length);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

/** 生成对象存储用的随机 key 片段 */
export function randomId(bytes = 12) {
  return crypto.randomBytes(bytes).toString('hex');
}
