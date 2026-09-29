import { all, get, run, transaction } from '../db.js';
import { HttpError } from '../lib/http.js';
import { nowStr } from '../lib/utils.js';
import { getStorageConfig } from './settings.js';
import { resolvePublicUrl } from './storage/index.js';
import { createLocalStorage } from './storage/local.js';
import { extFromFilename, extFromMimetype } from './media.js';
import { randomId } from '../lib/crypto.js';

/** 表情包文件统一存本机 uploads/stickers/ 下，容量小、访问频繁，不走对象存储 */
const STICKER_PREFIX = 'stickers';
/** 单个表情包大小上限 */
const MAX_STICKER_SIZE = 5 * 1024 * 1024;
/** 一次性最多返回的表情包数量，避免前台一次拉太多 */
const MAX_LIST = 500;

function localAdapter() {
  return createLocalStorage(getStorageConfig().local);
}

/** 本机 key -> 可访问地址 */
function publicUrlOf(key) {
  return resolvePublicUrl(key, null, null, null);
}

function toPack(row) {
  return {
    id: row.id,
    name: row.name,
    iconUrl: row.icon_key ? publicUrlOf(row.icon_key) : '',
    sortOrder: row.sort_order,
    enabled: Boolean(row.enabled),
    count: row.count ?? 0,
  };
}

function toSticker(row) {
  return {
    id: row.id,
    packId: row.pack_id,
    name: row.name || '',
    url: publicUrlOf(row.storage_key),
    sortOrder: row.sort_order,
  };
}

/* --------------------------------- 后台管理 --------------------------------- */

/** 所有套装（含停用的）及其表情包数量 */
export function listPacks() {
  return all(
    `SELECT p.*, (SELECT COUNT(*) FROM stickers s WHERE s.pack_id = p.id) AS count
     FROM sticker_packs p
     ORDER BY p.sort_order ASC, p.id ASC`,
  ).map(toPack);
}

/** 某一套里的全部表情包 */
export function listStickers(packId) {
  return all(
    'SELECT * FROM stickers WHERE pack_id = ? ORDER BY sort_order ASC, id ASC',
    [Number(packId)],
  ).map(toSticker);
}

/** 后台一次性拿到全部套装与表情包，减少请求次数 */
export function listPacksWithStickers() {
  return listPacks().map((pack) => ({ ...pack, stickers: listStickers(pack.id) }));
}

function getPackRow(id) {
  return get('SELECT * FROM sticker_packs WHERE id = ?', [id]);
}

function normalizeName(value, fallback = '') {
  return String(value ?? fallback).trim().slice(0, 40);
}

export function createPack(input = {}) {
  const name = normalizeName(input.name);
  if (!name) throw new HttpError(400, '请填写表情包套装名称');
  const now = nowStr();
  const { lastInsertRowid } = run(
    `INSERT INTO sticker_packs (name, icon_key, sort_order, enabled, created_at, updated_at)
     VALUES (?, '', ?, ?, ?, ?)`,
    [name, Number(input.sortOrder) || 0, input.enabled === false ? 0 : 1, now, now],
  );
  return toPack(getPackRow(lastInsertRowid));
}

export function updatePack(id, input = {}) {
  const row = getPackRow(id);
  if (!row) throw new HttpError(404, '表情包套装不存在');

  const name = input.name === undefined ? row.name : normalizeName(input.name);
  if (!name) throw new HttpError(400, '请填写表情包套装名称');

  run(
    'UPDATE sticker_packs SET name = ?, sort_order = ?, enabled = ?, updated_at = ? WHERE id = ?',
    [
      name,
      input.sortOrder === undefined ? row.sort_order : Number(input.sortOrder) || 0,
      input.enabled === undefined ? row.enabled : input.enabled ? 1 : 0,
      nowStr(),
      id,
    ],
  );
  return toPack(getPackRow(id));
}

export function deletePack(id) {
  const row = getPackRow(id);
  if (!row) throw new HttpError(404, '表情包套装不存在');

  const files = all('SELECT storage_key FROM stickers WHERE pack_id = ?', [id]).map(
    (s) => s.storage_key,
  );
  if (row.icon_key) files.push(row.icon_key);

  transaction(() => {
    run('DELETE FROM stickers WHERE pack_id = ?', [id]);
    run('DELETE FROM sticker_packs WHERE id = ?', [id]);
  });
  void removeFiles(files);
  return { ok: true };
}

/** 上传/替换套装 icon 图 */
export async function setPackIcon(id, part) {
  const row = getPackRow(id);
  if (!row) throw new HttpError(404, '表情包套装不存在');

  const { ext, buffer } = await readImagePart(part, '请选择 icon 图片');
  const fileKey = `${STICKER_PREFIX}/icon-${id}-${randomId(6)}.${ext}`;
  await localAdapter().put(fileKey, buffer);

  const previous = row.icon_key;
  run('UPDATE sticker_packs SET icon_key = ?, updated_at = ? WHERE id = ?', [
    fileKey,
    nowStr(),
    id,
  ]);
  if (previous) void removeFiles([previous]);
  return toPack(getPackRow(id));
}

/** 读取上传的图片分片，返回 { ext, buffer }；buffer 已就绪时直接使用 */
async function readImagePart(part, emptyMessage) {
  if (!part) throw new HttpError(400, emptyMessage);
  const buffer = part.buffer || (await part.toBuffer());
  if (buffer.length === 0) throw new HttpError(400, '图片内容为空');
  if (buffer.length > MAX_STICKER_SIZE) {
    throw new HttpError(400, `单个表情包不能超过 ${MAX_STICKER_SIZE / 1024 / 1024}MB`);
  }
  if (!String(part.mimetype || '').startsWith('image/')) {
    throw new HttpError(400, '只能上传图片文件');
  }
  // 表情包原样保存（不生成缩略图），否则 GIF 会丢掉动画
  const ext = extFromMimetype(part.mimetype) || extFromFilename(part.filename) || 'png';
  return { ext, buffer };
}

/** 批量上传表情包到某一套 */
export async function uploadStickers(packId, parts) {
  const row = getPackRow(packId);
  if (!row) throw new HttpError(404, '表情包套装不存在');
  if (!Array.isArray(parts) || parts.length === 0) throw new HttpError(400, '请选择要上传的图片');

  const created = [];
  for (const part of parts) {
    try {
      const { ext, buffer } = await readImagePart(part, '请选择要上传的图片');
      const fileKey = `${STICKER_PREFIX}/${packId}-${Date.now().toString(36)}-${randomId(6)}.${ext}`;
      await localAdapter().put(fileKey, buffer);
      const now = nowStr();
      const { lastInsertRowid } = run(
        `INSERT INTO stickers (pack_id, name, storage_key, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [packId, '', fileKey, Date.now() % 1_000_000, now, now],
      );
      created.push(lastInsertRowid);
    } catch {
      // 单个文件失败不影响其余文件
    }
  }
  if (created.length === 0) throw new HttpError(400, '没有可用的图片文件');
  return { uploaded: created.length, stickers: listStickers(packId) };
}

export function deleteSticker(id) {
  const row = get('SELECT * FROM stickers WHERE id = ?', [id]);
  if (!row) throw new HttpError(404, '表情包不存在');
  run('DELETE FROM stickers WHERE id = ?', [id]);
  void removeFiles([row.storage_key]);
  return { ok: true };
}

/** 删除本机文件，失败不阻塞数据库操作 */
async function removeFiles(keys) {
  const adapter = localAdapter();
  for (const key of keys) {
    if (!key) continue;
    await adapter.remove(key).catch(() => {});
  }
}

/* ---------------------------------- 前台 ---------------------------------- */

/**
 * 前台表情包列表：只下发启用的套装，按套分组。
 * 前后台字段保持一致，评论框直接按分组渲染。
 */
export function publicStickerPacks() {
  const packs = all(
    `SELECT p.*, (SELECT COUNT(*) FROM stickers s WHERE s.pack_id = p.id) AS count
     FROM sticker_packs p
     WHERE p.enabled = 1
     ORDER BY p.sort_order ASC, p.id ASC`,
  ).map(toPack);

  const result = [];
  let remain = MAX_LIST;
  for (const pack of packs) {
    if (remain <= 0) break;
    const stickers = all(
      'SELECT * FROM stickers WHERE pack_id = ? ORDER BY sort_order ASC, id ASC LIMIT ?',
      [pack.id, remain],
    ).map(toSticker);
    if (stickers.length === 0) continue;
    remain -= stickers.length;
    result.push({
      ...pack,
      // 套装没单独设 icon 时，用该套第一张表情兜底
      iconUrl: pack.iconUrl || stickers[0].url,
      stickers,
    });
  }
  return result;
}

/** 批量取表情包信息：stickerId -> { id, url } */
export function stickerMapFor(ids) {
  const unique = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const map = new Map();
  if (unique.length === 0) return map;
  const placeholders = unique.map(() => '?').join(',');
  for (const row of all(`SELECT * FROM stickers WHERE id IN (${placeholders})`, unique)) {
    map.set(row.id, { id: row.id, url: publicUrlOf(row.storage_key) });
  }
  return map;
}

/** 允许发送的表情包 id 集合（仅限启用的套装） */
export function allowedStickerIds() {
  return new Set(
    all(
      `SELECT s.id FROM stickers s JOIN sticker_packs p ON p.id = s.pack_id WHERE p.enabled = 1`,
    ).map((row) => row.id),
  );
}

export { STICKER_PREFIX };