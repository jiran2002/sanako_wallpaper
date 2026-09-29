import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** server/ 目录 */
export const SERVER_ROOT = path.resolve(__dirname, '..');
/** 仓库根目录 */
export const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');

// 依次加载 server/.env、根目录 .env（先加载的优先，不覆盖已有值）
for (const file of [path.join(SERVER_ROOT, '.env'), path.join(PROJECT_ROOT, '.env')]) {
  if (fs.existsSync(file)) dotenv.config({ path: file });
}

/** 相对路径统一按 server/ 目录解析 */
function resolveFromServer(value, fallback) {
  const raw = (value || fallback || '').trim();
  return path.isAbsolute(raw) ? raw : path.resolve(SERVER_ROOT, raw);
}

function stripSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',
  publicBaseUrl: stripSlash(process.env.PUBLIC_BASE_URL || 'http://localhost:8080'),
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-please-change',
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },
  dbFile: resolveFromServer(process.env.DB_FILE, 'data/app.db'),
  // 运行日志按天写入该目录（app-YYYY-MM-DD.log）
  logDir: resolveFromServer(process.env.LOG_DIR, 'logs'),
  local: {
    dir: resolveFromServer(process.env.LOCAL_STORAGE_DIR, 'data/uploads'),
    publicUrl: process.env.LOCAL_PUBLIC_URL || '/uploads',
  },
  defaults: {
    storageDriver: process.env.STORAGE_DRIVER || 'local',
    storageStrategy: process.env.STORAGE_STRATEGY || 'round_robin',
  },
  webDist: path.resolve(PROJECT_ROOT, 'web', 'dist'),
  // 单个文件最大 100MB，单次请求最多 50 个文件
  maxFileSize: 100 * 1024 * 1024,
  maxFiles: 50,
};
