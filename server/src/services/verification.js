import crypto from 'node:crypto';

/**
 * 邮箱验证码：内存存储，10 分钟有效，最多尝试 5 次。
 * 用于注册时的「邮箱验证码」模式（验证码通过 SMTP 发送）。
 */
const store = new Map(); // email -> { code, expiresAt, attempts }

export function createEmailCode(email) {
  const key = String(email || '').trim().toLowerCase();
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  store.set(key, { code, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 });
  return code;
}

/** 校验邮箱验证码（不消耗，注册成功后由 consumeEmailCode 清除） */
export function verifyEmailCode(email, code) {
  const key = String(email || '').trim().toLowerCase();
  const record = store.get(key);
  if (!record) return false;
  if (Date.now() > record.expiresAt) {
    store.delete(key);
    return false;
  }
  record.attempts += 1;
  if (record.attempts > 5) {
    store.delete(key);
    return false;
  }
  return String(code || '').trim() === record.code;
}

/** 注册成功后清除该邮箱的验证码 */
export function consumeEmailCode(email) {
  const key = String(email || '').trim().toLowerCase();
  store.delete(key);
}