import { get } from '../db.js';
import { config } from '../config.js';
import { hashPassword, randomId, verifyPassword } from '../lib/crypto.js';
import { badRequest, conflict, HttpError } from '../lib/http.js';
import { extFromFilename, makeAvatar } from '../services/media.js';
import { canAccessBackoffice } from '../services/roles.js';
import { getSiteConfig, getStorageConfig, isEmailConfigured } from '../services/settings.js';
import { createLocalStorage } from '../services/storage/local.js';
import { createCaptcha, verifyCaptcha } from '../services/captcha.js';
import { sendMail, verificationEmail, resetPasswordEmail } from '../services/mail.js';
import { consumeEmailCode, createEmailCode, verifyEmailCode } from '../services/verification.js';
import { assertInviteValid, consumeInviteCode } from '../services/invites.js';
import {
  countAdmins,
  getUserForAuth,
  getUserRow,
  insertUser,
  isFirstRegisteredUser,
  markRegistered,
  serializeAuthUser,
  serializeUser,
  touchLogin,
  updateAvatar,
  updatePasswordHash,
  updateProfile,
  usernameTaken,
} from '../services/users.js';

/** 头像固定放在本机存储的 avatars/ 目录下，通过 /uploads 前缀对外提供 */
const AVATAR_PREFIX = '/uploads/avatars/';
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

/** 用户名：2-20 位中英文、数字、下划线、短横线 */
const USERNAME_RE = /^[\w\u4e00-\u9fa5-]{2,20}$/;
/** 邮箱基本格式 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 发送邮箱验证码的冷却期（按邮箱，60 秒），防止刷短信/邮件 */
const codeCooldown = new Map();

/** 密码重置令牌：内存存储，15 分钟有效，用后即焚 */
const resetTokens = new Map(); // token -> { userId, expiresAt }

function assertCanSendCode(email) {
  const now = Date.now();
  const last = codeCooldown.get(email) || 0;
  if (now - last < 60 * 1000) throw new HttpError(429, '发送太频繁，请稍后再试');
  codeCooldown.set(email, now);
}

function signToken(app, user) {
  return app.jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    { expiresIn: '7d' },
  );
}

/** 登录后的统一返回体（带权限，前端据此控制入口） */
function loginPayload(app, user) {
  return { token: signToken(app, user), user: serializeAuthUser(user) };
}

/** 账号被封禁时统一拦截 */
function assertActive(row) {
  if (Number(row.status ?? 1) !== 1) throw new HttpError(403, '账号已被封禁，请联系管理员');
}

export default async function authRoutes(app) {
  /* ------------------------------- 注册 / 登录 ------------------------------- */

  app.post('/api/auth/register', async (req) => {
    const cfg = getSiteConfig();
    if (!cfg.registrationEnabled) throw new HttpError(403, '本站已关闭注册');

    const body = req.body || {};
    const username = String(body.username || '').trim();
    if (!USERNAME_RE.test(username)) {
      throw badRequest('用户名需 2-20 位，仅支持中英文、数字、下划线与短横线');
    }
    if (String(body.password || '').length < 6) throw badRequest('密码至少 6 位');
    if (usernameTaken(username)) throw conflict('该用户名已被注册');

    // 邮箱：「邮箱验证码」模式下必填且需校验验证码；其余情况选填（留作后续找回密码等）
    const email = String(body.email || '').trim().toLowerCase();
    if (cfg.registerCodeMode === 'email') {
      if (!EMAIL_RE.test(email)) throw badRequest('请填写正确的邮箱地址');
      if (!verifyEmailCode(email, body.code)) throw badRequest('邮箱验证码错误或已过期');
    } else if (email && !EMAIL_RE.test(email)) {
      throw badRequest('邮箱格式不正确');
    }

    // 邀请码
    const inviteCode = String(body.inviteCode || '').trim();
    if (cfg.inviteMode === 'required') {
      assertInviteValid(inviteCode);
    } else if (cfg.inviteMode === 'optional' && inviteCode) {
      assertInviteValid(inviteCode);
    }

    // 图形验证码
    if (cfg.registerCodeMode === 'captcha') {
      if (!verifyCaptcha(body.captchaId, body.captchaCode)) throw badRequest('图形验证码错误或已过期');
    }

    // 仅当站点还没有任何管理员时，第一个注册用户才自动成为管理员；否则默认「会员」组
    const firstUser = isFirstRegisteredUser() && countAdmins() === 0;
    const user = insertUser({
      username,
      passwordHash: hashPassword(String(body.password)),
      role: firstUser ? 'admin' : 'member',
      nickname: String(body.nickname || '').trim(),
      email,
    });
    markRegistered();
    touchLogin(user.id);

    // 注册成功后消耗邮箱验证码与邀请码
    consumeEmailCode(email);
    consumeInviteCode(inviteCode);

    const fresh = getUserRow(user.id);
    return { ...loginPayload(app, fresh), becameAdmin: firstUser };
  });

  /** 发送注册邮箱验证码（仅「邮箱验证码」模式使用） */
  app.post('/api/auth/send-code', async (req) => {
    const cfg = getSiteConfig();
    if (!cfg.registrationEnabled) throw new HttpError(403, '本站已关闭注册');
    if (cfg.registerCodeMode !== 'email') throw badRequest('当前注册模式不需要邮箱验证码');

    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw badRequest('请填写正确的邮箱地址');
    if (get('SELECT id FROM users WHERE email = ?', [email])) throw conflict('该邮箱已被注册');
    if (!isEmailConfigured()) throw new HttpError(500, '邮箱服务未配置，请联系管理员');
    assertCanSendCode(email);

    const code = createEmailCode(email);
    try {
      await sendMail({ to: email, ...verificationEmail({ code }) });
    } catch (err) {
      throw new HttpError(500, err.message || '验证码发送失败，请稍后再试');
    }
    return { ok: true };
  });

  /** 忘记密码：按邮箱发送重置链接（防枚举：邮箱不存在也返回相同提示） */
  app.post('/api/auth/forgot-password', async (req) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw badRequest('请填写正确的邮箱地址');
    if (!isEmailConfigured()) throw new HttpError(500, '邮箱服务未配置，请联系管理员');

    const user = get('SELECT id FROM users WHERE email = ?', [email]);
    if (user) {
      const token = randomId(24);
      resetTokens.set(token, { userId: user.id, expiresAt: Date.now() + 15 * 60 * 1000 });
      const resetUrl = `${config.publicBaseUrl}/reset-password?token=${token}`;
      try {
        await sendMail({ to: email, ...resetPasswordEmail({ resetUrl }) });
      } catch (err) {
        resetTokens.delete(token);
        throw new HttpError(500, err.message || '邮件发送失败，请稍后再试');
      }
    }
    return { ok: true };
  });

  /** 重置密码：校验令牌并写入新密码（一次性） */
  app.post('/api/auth/reset-password', async (req) => {
    const token = String((req.body || {}).token || '');
    const record = resetTokens.get(token);
    if (!record || Date.now() > record.expiresAt) {
      if (record) resetTokens.delete(token);
      throw badRequest('重置链接无效或已过期');
    }
    const password = String((req.body || {}).password || '');
    if (password.length < 6) throw badRequest('新密码至少 6 位');

    updatePasswordHash(record.userId, hashPassword(password));
    resetTokens.delete(token);
    return { ok: true };
  });

  /** 图形验证码（注册「图形验证码」模式与游客下载验证共用） */
  app.get('/api/auth/captcha', async () => createCaptcha());

  app.post('/api/auth/login', async (req) => {
    const body = req.body || {};
    if (!body.username || !body.password) throw badRequest('请输入用户名和密码');

    const row = getUserForAuth(body.username);
    if (!row || !verifyPassword(body.password, row.password_hash)) {
      throw new HttpError(401, '用户名或密码错误');
    }
    assertActive(row);

    touchLogin(row.id);
    return loginPayload(app, getUserRow(row.id));
  });

  /** 当前登录用户（前台通用） */
  app.get('/api/auth/me', { onRequest: [app.authenticate] }, async (req) => {
    const user = getUserRow(req.user.sub);
    if (!user) throw new HttpError(401, '账号不存在或已被删除');
    return serializeAuthUser(user);
  });

  /* --------------------------------- 个人资料 -------------------------------- */

  app.put('/api/auth/profile', { onRequest: [app.authenticate] }, async (req) => {
    const body = req.body || {};
    const nickname = String(body.nickname ?? '').trim();
    if (!nickname) throw badRequest('请填写昵称');
    if (nickname.length > 24) throw badRequest('昵称不能超过 24 个字符');

    const bio = String(body.bio ?? '').trim();
    if (bio.length > 200) throw badRequest('个人简介不能超过 200 个字符');

    return serializeUser(updateProfile(req.user.sub, { nickname, bio }));
  });

  app.put('/api/auth/password', { onRequest: [app.authenticate] }, async (req) => {
    const body = req.body || {};
    const { oldPassword, newPassword } = body;
    if (!oldPassword || !newPassword) throw badRequest('请填写原密码与新密码');
    if (String(newPassword).length < 6) throw badRequest('新密码至少 6 位');

    const row = get('SELECT id, password_hash FROM users WHERE id = ?', [req.user.sub]);
    if (!row || !verifyPassword(oldPassword, row.password_hash)) throw badRequest('原密码不正确');

    updatePasswordHash(row.id, hashPassword(String(newPassword)));
    return { ok: true };
  });

  /* ---------------------------------- 头像 ---------------------------------- */

  app.post('/api/auth/avatar', { onRequest: [app.authenticate] }, async (req) => {
    const part = await req.file();
    if (!part) throw badRequest('请选择头像图片');

    const buffer = await part.toBuffer();
    if (!buffer.length) throw badRequest('头像文件为空');
    if (buffer.length > MAX_AVATAR_SIZE) throw badRequest('头像不能超过 5MB');
    if (!String(part.mimetype || '').startsWith('image/')) throw badRequest('头像必须是图片文件');

    const squared = await makeAvatar(buffer);
    const ext = squared ? 'webp' : extFromFilename(part.filename) || 'jpg';
    const key = `avatars/${req.user.sub}-${randomId(6)}.${ext}`;

    const adapter = createLocalStorage(getStorageConfig().local);
    await adapter.put(key, squared || buffer);

    const current = getUserRow(req.user.sub);
    const previous = current.avatar || '';
    const user = updateAvatar(current.id, `/uploads/${key}`);

    // 旧头像只清理本机 avatars/ 下的文件，外链一律不动
    if (previous.startsWith(AVATAR_PREFIX)) {
      await adapter.remove(previous.slice('/uploads/'.length)).catch(() => {});
    }
    return serializeUser(user);
  });

  /* ----------------------------- 后台登录（需后台权限） ----------------------------- */

  app.post('/api/admin/login', async (req) => {
    const body = req.body || {};
    if (!body.username || !body.password) throw badRequest('请输入用户名和密码');

    const row = getUserForAuth(body.username);
    if (!row || !verifyPassword(body.password, row.password_hash)) {
      throw new HttpError(401, '用户名或密码错误');
    }
    assertActive(row);
    if (!canAccessBackoffice(row.role)) {
      throw new HttpError(403, '该账号没有后台管理权限');
    }

    touchLogin(row.id);
    return loginPayload(app, getUserRow(row.id));
  });

  app.get('/api/admin/me', { onRequest: [app.requireBackoffice] }, async (req) => {
    const user = getUserRow(req.user.sub);
    if (!user) throw new HttpError(401, '账号不存在或已被删除');
    return serializeAuthUser(user);
  });
}
