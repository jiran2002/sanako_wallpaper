import fs from 'node:fs';
import path from 'node:path';
import { all, db, run, scalar } from '../db.js';
import { config, SERVER_ROOT } from '../config.js';
import { HttpError } from '../lib/http.js';
import { nowStr } from '../lib/utils.js';
import { buildThumbKey, buildVariantKey, extractColor, formatBytes, hasSharp, makeThumbnail, makeVariants, perceptualHash } from './media.js';
import { getStorageConfig } from './settings.js';
import { purgeExpiredTrash, setImageVariants, TRASH_KEEP_DAYS } from './images.js';
import { createRemoteStorage, getAccount } from './storage/index.js';
import { createLocalStorage } from './storage/local.js';

/** 备份目录与保留份数：只保留最近 7 份，避免磁盘被备份占满 */
const BACKUP_DIR = path.resolve(SERVER_ROOT, 'backups');
const BACKUP_KEEP = 7;
/** 单次任务处理的图片上限，避免一次跑太久把接口卡住，剩余的下次继续 */
const IMAGE_BATCH = 200;

/**
 * 把存储里的指定文件读成 Buffer（本机 / 远程统一处理）。
 * key 由调用方决定：算主色与指纹用缩略图即可，避免拉取十几 MB 的原图。
 */
async function readBuffer(row, key) {
  if (!key) return null;
  if (row.storage_account_id) {
    const account = getAccount(row.storage_account_id);
    if (!account) return null;
    const res = await createRemoteStorage(account).get(key);
    const chunks = [];
    for await (const chunk of res.stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  const adapter = createLocalStorage(getStorageConfig().local);
  const chunks = [];
  for await (const chunk of adapter.createReadStream(key)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** 从 variants 字段解析出全部存储 key（脏数据一律忽略） */
function parseVariantKeys(value) {
  if (!value) return [];
  try {
    const arr = JSON.parse(value);
    if (!Array.isArray(arr)) return [];
    return arr.map((item) => item?.key).filter(Boolean);
  } catch {
    return [];
  }
}

/** 递归列出目录下的全部文件（绝对路径） */
function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

/* ------------------------------- 具体任务 ------------------------------- */

/** 为老数据补算主色与感知指纹（按主色筛选、上传查重都依赖它们） */
async function backfillColors() {
  const rows = all(
    `SELECT id, storage_key, thumb_key, storage_account_id FROM images
      WHERE kind = 'image' AND deleted_at = '' AND (color_bucket = '' OR phash = '')
      ORDER BY id ASC LIMIT ?`,
    [IMAGE_BATCH],
  );
  let done = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      // 主色与 dHash 都会把图缩到极小尺寸再计算，用缩略图结果基本一致，
      // 但体积从十几 MB 降到几十 KB，远程读取快很多
      const buffer = await readBuffer(row, row.thumb_key || row.storage_key);
      if (!buffer) {
        failed += 1;
        continue;
      }
      const color = await extractColor(buffer);
      const phash = await perceptualHash(buffer);
      run('UPDATE images SET dominant_color = ?, color_bucket = ?, phash = ? WHERE id = ?', [
        color?.hex || '',
        color?.bucket || '',
        phash || '',
        row.id,
      ]);
      done += 1;
    } catch {
      failed += 1;
    }
  }
  const remain = Number(
    scalar("SELECT COUNT(*) FROM images WHERE kind = 'image' AND deleted_at = '' AND (color_bucket = '' OR phash = '')") ?? 0,
  );
  return { detail: `已处理 ${done} 张，失败 ${failed} 张，剩余 ${remain} 张待处理` };
}

/**
 * 为老图补生成多尺寸预览图。
 * 每张都要把原图拉回来（远程对象存储带宽有限），故单次上限远小于其它任务，
 * 剩下的留给每日定时任务分批补，避免一次跑太久。
 */
const VARIANT_BATCH = 20;

async function backfillVariants() {
  if (!(await hasSharp())) return { detail: '未安装 sharp，无法生成多尺寸预览图' };
  const rows = all(
    `SELECT id, storage_key, storage_account_id, width FROM images
      WHERE kind = 'image' AND format != 'gif' AND width > 1280 AND deleted_at = ''
        AND (variants IS NULL OR variants = '[]')
      ORDER BY id ASC LIMIT ?`,
    [VARIANT_BATCH],
  );
  let done = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const buffer = await readBuffer(row, row.storage_key);
      if (!buffer) {
        failed += 1;
        continue;
      }
      const variants = await makeVariants(buffer, { originalWidth: row.width });
      if (variants.length === 0) {
        failed += 1;
        continue;
      }
      const saved = [];
      for (const variant of variants) {
        const key = buildVariantKey(row.storage_key, variant.width);
        if (row.storage_account_id) {
          const account = getAccount(row.storage_account_id);
          if (!account) continue;
          await createRemoteStorage(account).put(key, variant.buffer, 'image/webp');
        } else {
          await createLocalStorage(getStorageConfig().local).put(key, variant.buffer);
        }
        saved.push({ width: variant.width, key });
      }
      if (saved.length === 0) {
        failed += 1;
        continue;
      }
      setImageVariants(row.id, saved);
      done += 1;
    } catch {
      failed += 1;
    }
  }
  const remain = Number(
    scalar(
      `SELECT COUNT(*) FROM images
        WHERE kind = 'image' AND format != 'gif' AND width > 1280 AND deleted_at = ''
          AND (variants IS NULL OR variants = '[]')`,
    ) ?? 0,
  );
  return { detail: `已生成 ${done} 张，失败 ${failed} 张，剩余 ${remain} 张待处理` };
}

/** 为缺失缩略图的壁纸重新生成缩略图 */
async function rebuildThumbs() {
  const rows = all(
    `SELECT id, storage_key, storage_account_id FROM images
      WHERE kind = 'image' AND deleted_at = '' AND (thumb_key IS NULL OR thumb_key = '')
      ORDER BY id ASC LIMIT ?`,
    [IMAGE_BATCH],
  );
  let done = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const buffer = await readBuffer(row, row.storage_key);
      if (!buffer) {
        failed += 1;
        continue;
      }
      const thumb = await makeThumbnail(buffer);
      if (!thumb) {
        failed += 1;
        continue;
      }
      const key = buildThumbKey(row.storage_key);
      if (row.storage_account_id) {
        const account = getAccount(row.storage_account_id);
        if (!account) {
          failed += 1;
          continue;
        }
        await createRemoteStorage(account).put(key, thumb, 'image/webp');
      } else {
        await createLocalStorage(getStorageConfig().local).put(key, thumb);
      }
      run('UPDATE images SET thumb_key = ?, updated_at = ? WHERE id = ?', [key, nowStr(), row.id]);
      done += 1;
    } catch {
      failed += 1;
    }
  }
  const remain = Number(
    scalar("SELECT COUNT(*) FROM images WHERE kind = 'image' AND deleted_at = '' AND (thumb_key IS NULL OR thumb_key = '')") ?? 0,
  );
  return { detail: `已重建 ${done} 张，失败 ${failed} 张，剩余 ${remain} 张待处理` };
}

/**
 * 清理孤儿文件：只扫描本机存储 originals/ 下、数据库里已无人引用的文件。
 * 对象存储（S3 / R2）无法低成本全量列举，这里直接跳过。
 */
async function cleanupOrphans() {
  const cfg = getStorageConfig();
  if (cfg.driver !== 'local') {
    return { detail: '当前使用对象存储，已跳过（不支持扫描远端文件）' };
  }
  const adapter = createLocalStorage(cfg.local);
  const originalsDir = path.join(adapter.root, 'originals');
  if (!fs.existsSync(originalsDir)) return { detail: '本机没有 originals 目录，无需清理' };

  const referenced = new Set();
  // 这里刻意「不」过滤回收站：软删除的图片文件必须保留到彻底删除，
  // 否则回收站里的图会先被当孤儿删掉，恢复出来就是坏图。
  for (const row of all(
    'SELECT storage_key, thumb_key, variants FROM images WHERE storage_account_id IS NULL',
  )) {
    if (row.storage_key) referenced.add(row.storage_key);
    if (row.thumb_key) referenced.add(row.thumb_key);
    // 多尺寸变体与原图同目录，漏掉会被当孤儿误删
    for (const item of parseVariantKeys(row.variants)) referenced.add(item);
  }

  let removed = 0;
  let freed = 0;
  for (const file of walkFiles(originalsDir)) {
    const key = path.relative(adapter.root, file).split(path.sep).join('/');
    if (referenced.has(key)) continue;
    try {
      freed += fs.statSync(file).size;
      fs.rmSync(file, { force: true });
      removed += 1;
    } catch {
      // 单个文件删不掉就跳过，不影响其它文件
    }
  }
  return { detail: `清理 ${removed} 个孤儿文件，释放 ${formatBytes(freed)}` };
}

/** 清理回收站里超过保留天数的图片（彻底删除文件与记录） */
async function purgeTrash() {
  const count = await purgeExpiredTrash();
  const remain = Number(scalar("SELECT COUNT(*) FROM images WHERE deleted_at != ''") ?? 0);
  return { detail: `已彻底删除 ${count} 张超期图片，回收站剩余 ${remain} 张` };
}

/** SQLite 在线备份：VACUUM INTO 一份完整副本，并只保留最近若干份 */
function backupDatabase() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const name = `app-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(
    d.getMinutes(),
  )}${p(d.getSeconds())}-${d.getMilliseconds()}.db`;
  const target = path.join(BACKUP_DIR, name);
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.db'))
    .sort();
  let removed = 0;
  while (files.length - removed > BACKUP_KEEP) {
    fs.rmSync(path.join(BACKUP_DIR, files[removed]), { force: true });
    removed += 1;
  }
  return { detail: `已备份到 backups/${name}（${formatBytes(fs.statSync(target).size)}），清理旧备份 ${removed} 份` };
}

/** 全部可执行任务：后台页面按此列表展示 */
export const TASKS = [
  { key: 'backup-db', name: '数据库备份', description: '把 SQLite 完整备份到 server/backups/，只保留最近 7 份', run: backupDatabase },
  { key: 'cleanup-orphans', name: '孤儿文件清理', description: '删除本机 originals/ 下数据库已不再引用的文件', run: cleanupOrphans },
  { key: 'rebuild-thumbs', name: '重建缩略图', description: '为缺少缩略图的壁纸重新生成，单次最多 200 张', run: rebuildThumbs },
  { key: 'backfill-colors', name: '回填主色与指纹', description: '为老数据补算主色与感知指纹，单次最多 200 张', run: backfillColors },
  { key: 'backfill-variants', name: '补生成多尺寸预览图', description: '为老图生成 1280/1920/2560 的 webp 变体，单次最多 20 张', run: backfillVariants },
  { key: 'purge-trash', name: '清理回收站', description: `彻底删除回收站里超过 ${TRASH_KEEP_DAYS} 天的图片（含存储文件）`, run: purgeTrash },
];

export function listTasks() {
  return TASKS.map(({ key, name, description }) => ({
    key,
    name,
    description,
    lastRun:
      all('SELECT id, trigger, status, detail, started_at, finished_at FROM task_runs WHERE task = ? ORDER BY id DESC LIMIT 1', [key])[0] ||
      null,
  }));
}

export function listTaskRuns(limit = 30) {
  const size = Math.min(100, Math.max(1, Number(limit) || 30));
  return all(
    'SELECT id, task, trigger, status, detail, started_at, finished_at FROM task_runs ORDER BY id DESC LIMIT ?',
    [size],
  ).map((row) => ({
    id: row.id,
    task: row.task,
    trigger: row.trigger,
    status: row.status,
    detail: row.detail,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }));
}

/** 执行一个任务并记录执行结果；任务不存在或执行失败时抛错 */
export async function runTask(key, { trigger = 'manual' } = {}) {
  const task = TASKS.find((item) => item.key === key);
  if (!task) throw new HttpError(404, '任务不存在');

  const { lastInsertRowid } = run(
    'INSERT INTO task_runs (task, trigger, status, detail, started_at) VALUES (?, ?, ?, ?, ?)',
    [key, trigger, 'running', '', nowStr()],
  );
  const startedAt = Date.now();
  try {
    const result = await task.run();
    run('UPDATE task_runs SET status = ?, detail = ?, finished_at = ? WHERE id = ?', [
      'success',
      result?.detail || '',
      nowStr(),
      lastInsertRowid,
    ]);
    return { key, detail: result?.detail || '', elapsed: Date.now() - startedAt };
  } catch (err) {
    run('UPDATE task_runs SET status = ?, detail = ?, finished_at = ? WHERE id = ?', [
      'failed',
      String(err?.message || err).slice(0, 300),
      nowStr(),
      lastInsertRowid,
    ]);
    throw err;
  }
}

/** 每天一次的定时维护：数据库备份 + 孤儿文件清理 + 分批补多尺寸预览图 */
const DAILY_INTERVAL = 24 * 60 * 60 * 1000;

export function startScheduler(logger) {
  const runScheduled = async () => {
    for (const key of ['backup-db', 'cleanup-orphans', 'backfill-variants', 'purge-trash']) {
      try {
        const res = await runTask(key, { trigger: 'schedule' });
        logger?.info?.(`定时任务 ${key} 完成：${res.detail}`);
      } catch (err) {
        logger?.error?.(err, `定时任务 ${key} 失败`);
      }
    }
  };

  // 启动后延迟 1 分钟首次执行，避免和启动流程抢资源
  const first = setTimeout(runScheduled, 60 * 1000);
  first.unref?.();
  const timer = setInterval(runScheduled, DAILY_INTERVAL);
  timer.unref?.();
  logger?.info?.('定时维护已启用：数据库备份、孤儿文件清理与多尺寸预览图补生成每 24 小时执行一次');
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}