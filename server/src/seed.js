import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { get, run } from './db.js';
import { hashPassword } from './lib/crypto.js';
import { nowStr } from './lib/utils.js';
import { migrate, seedDefaults } from './migrate.js';

/** 数据库中还没有任何用户时，用环境变量里的账号创建一个管理员 */
export function ensureAdmin() {
  const count = Number(get('SELECT COUNT(*) AS n FROM users')?.n ?? 0);
  if (count > 0) return null;

  const now = nowStr();
  run(
    `INSERT INTO users (username, password_hash, role, nickname, bio, avatar, status, last_login_at, created_at, updated_at)
     VALUES (?, ?, 'admin', ?, '', '', 1, '', ?, ?)`,
    [config.admin.username, hashPassword(config.admin.password), config.admin.username, now, now],
  );
  return { username: config.admin.username, password: config.admin.password };
}

/** 初始化数据库结构、默认数据与管理员账号 */
export function bootstrap() {
  migrate();
  seedDefaults();
  fs.mkdirSync(config.local.dir, { recursive: true });
  return ensureAdmin();
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const created = bootstrap();
  if (created) {
    console.log(`[seed] 已创建管理员账号：${created.username} / ${created.password}`);
  } else {
    console.log('[seed] 管理员账号已存在，跳过创建');
  }
  console.log(`[seed] 数据库：${config.dbFile}`);
  console.log(`[seed] 本机图片目录：${config.local.dir}`);
}
