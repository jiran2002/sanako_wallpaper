import fs from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';

import { config } from './config.js';
import { scalar } from './db.js';
import { HttpError } from './lib/http.js';
import { createDailyRotateStream } from './lib/logger.js';
import { canAccessBackoffice, hasPermission, permissionsForRole } from './services/roles.js';
import { getUserAuthState } from './services/users.js';
import { getStorageConfig } from './services/settings.js';
import { listAccounts } from './services/storage/index.js';
import { createLocalStorage } from './services/storage/local.js';
import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import favoriteRoutes from './routes/favorites.js';
import adminRoutes from './routes/admin.js';
import storageRoutes from './routes/storage.js';
import uploadRoutes from './routes/upload.js';
import creatorRoutes from './routes/creator.js';
import fileRoutes from './routes/files.js';
import seoRoutes from './routes/seo.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.env === 'production' ? 'info' : 'debug',
      // 日志按天轮转到 server/logs/app-YYYY-MM-DD.log，同时镜像到 stdout
      stream: createDailyRotateStream(config.logDir),
    },
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
  });

  await app.register(cors, { origin: true, credentials: true });

  await app.register(jwt, { secret: config.jwtSecret });

  await app.register(multipart, {
    limits: {
      fileSize: config.maxFileSize,
      files: config.maxFiles,
      // 多图图包会为每张图各传一组 title / description，字段数放宽一些
      fields: 60,
    },
  });

  /**
   * 校验 token 并读取账号最新状态与权限（角色以数据库为准，改角色即时生效）。
   * 鉴权失败时会直接写出响应并返回 null。
   */
  async function resolveAuth(req, reply) {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: '未登录或登录已过期' });
      return null;
    }

    const state = getUserAuthState(req.user?.sub);
    if (!state) {
      reply.code(401).send({ error: '账号不存在或已被删除' });
      return null;
    }
    if (Number(state.status) !== 1) {
      reply.code(403).send({ error: '账号已被封禁，请联系管理员' });
      return null;
    }

    req.authUser = state;
    req.permissions = permissionsForRole(state.role);
    return state;
  }

  /** 鉴权：校验 Bearer Token，任何正常状态的登录用户均可通过 */
  app.decorate('authenticate', async function authenticate(req, reply) {
    await resolveAuth(req, reply);
  });

  /** 鉴权 + 权限校验：permission 可以是单个权限名，也可以是「任一满足」的数组 */
  app.decorate('requirePermission', function requirePermission(permission) {
    return async function permissionGuard(req, reply) {
      const state = await resolveAuth(req, reply);
      if (!state) return;
      if (!hasPermission(state.role, permission)) {
        return reply.code(403).send({ error: '当前账号没有该操作权限' });
      }
    };
  });

  /** 鉴权 + 后台准入：拥有任意一项管理权限即可进入后台 */
  app.decorate('requireBackoffice', async function requireBackoffice(req, reply) {
    const state = await resolveAuth(req, reply);
    if (!state) return;
    if (!canAccessBackoffice(state.role)) {
      return reply.code(403).send({ error: '当前账号没有后台访问权限' });
    }
  });

  /** 可选鉴权：带了有效 token 就注入权限，否则按「游客组」放行 */
  app.decorate('optionalAuth', async function optionalAuth(req) {
    req.permissions = permissionsForRole('guest');
    req.authUser = null;
    try {
      await req.jwtVerify();
    } catch {
      req.user = null;
      return;
    }
    const state = getUserAuthState(req.user?.sub);
    if (!state || Number(state.status) !== 1) {
      req.user = null;
      return;
    }
    req.authUser = state;
    req.permissions = permissionsForRole(state.role);
  });

  /* ------------------------------ 前端静态资源 ------------------------------ */
  const hasWebDist = fs.existsSync(config.webDist);
  if (hasWebDist) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      prefix: '/',
      index: ['index.html'],
    });
  }

  /* --------------------- 错误处理 / 404（必须早于路由注册） --------------------- */
  // Fastify 的错误处理器是「封装」的，只有在注册路由之前设置才会被所有路由继承
  app.setErrorHandler((err, req, reply) => {
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({
        error: `文件超过大小限制（单个文件最大 ${Math.round(config.maxFileSize / 1024 / 1024)}MB）`,
      });
    }
    if (err.code === 'FST_FILES_LIMIT') {
      return reply.code(413).send({ error: '单次上传文件数量过多' });
    }
    if (err.validation) {
      return reply.code(400).send({ error: err.message });
    }

    const status = err instanceof HttpError ? err.statusCode : err.statusCode || 500;
    if (status >= 500) {
      req.log.error(err);
      return reply.code(status).send({ error: '服务器内部错误，请查看服务端日志' });
    }
    return reply.code(status).send({ error: err.message || '请求失败' });
  });

  app.setNotFoundHandler((req, reply) => {
    const url = req.raw.url || '';
    if (url.startsWith('/api/') || url.startsWith('/uploads/')) {
      return reply.code(404).send({ error: '接口不存在' });
    }
    if (hasWebDist && (req.method === 'GET' || req.method === 'HEAD')) {
      // SPA 前端路由回退到 index.html
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({
      error: hasWebDist
        ? 'Not Found'
        : '前端尚未构建：请在 web/ 目录执行 npm run build，或访问开发服务器 http://localhost:5173',
    });
  });

  /* --------------------------------- 路由 --------------------------------- */
  /**
   * 健康检查：分成数据库与存储两项探活，任一项失败返回 503，
   * 便于外部监控（uptime 机器人 / 容器探针）直接判断服务是否可用。
   */
  app.get('/api/health', async (req, reply) => {
    const checks = {};

    // 数据库探活：跑一次最轻量的查询，确认连接与文件可读
    try {
      checks.db = { ok: Number(scalar('SELECT 1')) === 1 };
    } catch (err) {
      checks.db = { ok: false, error: err.message };
    }

    // 存储探活：本机存储实际写一个探针文件；远程账号只检查账号池是否可用
    const storageCfg = getStorageConfig();
    try {
      if (storageCfg.driver === 'local') {
        const result = await createLocalStorage(storageCfg.local).test();
        checks.storage = { ok: true, driver: 'local', message: result.message };
      } else {
        const accounts = listAccounts({ onlyEnabled: true });
        checks.storage = { ok: accounts.length > 0, driver: storageCfg.driver, accounts: accounts.length };
      }
    } catch (err) {
      checks.storage = { ok: false, driver: storageCfg.driver, error: err.message };
    }

    const ok = Object.values(checks).every((item) => item.ok);
    if (!ok) reply.code(503);
    return { ok, time: new Date().toISOString(), uptime: Math.round(process.uptime()), checks };
  });

  await app.register(publicRoutes);
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(favoriteRoutes);
  await app.register(adminRoutes);
  await app.register(storageRoutes);
  await app.register(uploadRoutes);
  await app.register(creatorRoutes);
  await app.register(fileRoutes);
  // SEO：robots / sitemap / 详情页注入 og 标签
  await app.register(seoRoutes);

  return app;
}
