import { all, get, run, scalar, transaction } from '../db.js';
import { HttpError } from '../lib/http.js';
import { nowStr } from '../lib/utils.js';
import { formatBytes, hammingDistance } from './media.js';
import { fullTextMatch, shouldUseFullText } from './search.js';
import { getStorageConfig } from './settings.js';
import {
  accountsMap,
  createRemoteStorage,
  getAccount,
  resolvePublicUrl,
} from './storage/index.js';
import { createLocalStorage } from './storage/local.js';

const BASE_SELECT = `
  SELECT i.*, c.name AS category_name, c.slug AS category_slug,
         c.display_style AS category_display_style
  FROM images i
  LEFT JOIN categories c ON c.id = i.category_id
`;

// 后台需要看到上传者，故额外 JOIN users（前台一律不下发发布者）
const BASE_SELECT_WITH_UPLOADER = `
  SELECT i.*, c.name AS category_name, c.slug AS category_slug,
         c.display_style AS category_display_style,
         u.username AS uploader_username, u.nickname AS uploader_nickname
  FROM images i
  LEFT JOIN categories c ON c.id = i.category_id
  LEFT JOIN users u ON u.id = i.user_id
`;

/** 分类展示样式：非法值一律按 pc 处理（与分类接口口径一致） */
function categoryStyle(value) {
  return value === 'mobile' || value === 'small' ? value : 'pc';
}

/** 壁纸状态：0 已隐藏 / 1 已发布 / 2 待审核 / 3 已驳回 */
export const IMAGE_STATUS = { hidden: 0, published: 1, pending: 2, rejected: 3 };

export const IMAGE_STATUS_TEXT = {
  0: '已隐藏',
  1: '已发布',
  2: '待审核',
  3: '已驳回',
};

function orientationOf(width, height) {
  if (width > height) return 'landscape';
  if (height > width) return 'portrait';
  return 'square';
}

/** 批量取标签：imageId -> [{id,name,slug}] */
function tagsByImage(ids) {
  const map = new Map(ids.map((id) => [id, []]));
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => '?').join(',');
  const rows = all(
    `SELECT it.image_id, t.id, t.name, t.slug
     FROM image_tags it JOIN tags t ON t.id = it.tag_id
     WHERE it.image_id IN (${placeholders})
     ORDER BY t.name ASC`,
    ids,
  );
  for (const row of rows) {
    map.get(row.image_id)?.push({ id: row.id, name: row.name, slug: row.slug });
  }
  return map;
}

/** 读取库里存的网盘链接（JSON 数组），脏数据一律当空数组 */
function parseMirrors(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** 读取库里存的多尺寸变体（JSON 数组），脏数据一律当空数组 */
function parseVariants(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * 网盘链接清洗：[{ name, url, code }]，链接必须合法，最多 10 条。
 * 由后台上传/编辑接口调用，非法数据直接报错，避免脏数据入库。
 */
export function normalizeMirrors(value) {
  if (value === undefined || value === null || value === '') return [];
  let list = value;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      throw new HttpError(400, '网盘链接格式不正确');
    }
  }
  if (!Array.isArray(list)) throw new HttpError(400, '网盘链接格式不正确');

  const out = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const url = String(raw.url || '').trim();
    if (!url) continue;
    if (!/^https?:\/\/\S+$/i.test(url)) throw new HttpError(400, `网盘链接不合法：${url}`);
    out.push({
      name: String(raw.name || '网盘').trim().slice(0, 24) || '网盘',
      url: url.slice(0, 500),
      code: String(raw.code || '').trim().slice(0, 32),
    });
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * 把数据库行转换成前端契约里的 Image 对象。
 * opts.allowOriginal=false 时（例如未开启下载权限的游客）只下发压缩预览图地址，
 * 并隐藏 storageKey —— 否则游客能据此拼出公开的原图直链绕过「登录后下载」。
 */
// 游客预览图的最大宽度上限：详情页对未授权用户展示 ≤1920 的 webp 变体，原图仍仅授权可下载
const PREVIEW_MAX_WIDTH = 1920;

export function serializeImage(row, tags = [], accounts = null, storageCfg = null, opts = {}) {
  const accs = accounts || accountsMap();
  const cfg = storageCfg || getStorageConfig();
  const allowOriginal = opts.allowOriginal !== false;

  const originalUrl =
    resolvePublicUrl(row.storage_key, row.storage_account_id, accs, cfg) || row.url || '';
  const thumbOnly = resolvePublicUrl(row.thumb_key, row.storage_account_id, accs, cfg);
  // GIF 必须下发原图才能播放动画（缩略图是 sharp 生成的首帧静态 webp），缩略图仅作原图缺失时的兜底；
  // 其它格式：优先缩略图，缩略图缺失时只有拿到下载授权的用户才允许回退用原图，避免预览图泄露原图
  const isGif = String(row.format || '').toLowerCase() === 'gif';
  const thumbUrl = isGif
    ? originalUrl || thumbOnly
    : thumbOnly || (allowOriginal ? originalUrl : '');
  // 视频封面要求自动播放（不能是静态图），故无论是否获得下载授权都下发可播放的视频地址，
  // 缩略图仅作加载前的 poster；图片仍遵循「登录后下载」，未授权只给缩略图
  const isVideo = row.kind === 'video';
  const mirrors = parseMirrors(row.mirrors);
  // 多尺寸变体是「接近原图」的预览。游客不再只拿到 720 缩略图，而是拿到不超过
  // PREVIEW_MAX_WIDTH 的变体作为详情页大图预览；原图与 2560 变体仍只给授权用户。
  const allVariants = parseVariants(row.variants)
    .map((item) => ({
      width: Number(item?.width) || 0,
      url: resolvePublicUrl(item?.key, row.storage_account_id, accs, cfg) || '',
    }))
    .filter((item) => item.width > 0 && item.url)
    .sort((a, b) => a.width - b.width);
  const variants = allowOriginal
    ? allVariants
    : allVariants.filter((item) => item.width <= PREVIEW_MAX_WIDTH);
  // 游客预览地址：取最大允许变体（≤1920），无变体时退回缩略图
  const previewUrl = variants.length > 0 ? variants[variants.length - 1].url : thumbUrl;

  return {
    id: row.id,
    kind: row.kind === 'video' ? 'video' : 'image',
    title: row.title,
    description: row.description || '',
    filename: row.filename,
    url: isVideo ? originalUrl || thumbUrl : allowOriginal ? originalUrl : previewUrl,
    thumbUrl,
    width: row.width,
    height: row.height,
    size: row.size,
    sizeText: formatBytes(row.size),
    format: row.format,
    orientation: orientationOf(row.width, row.height),
    downloads: row.downloads,
    views: row.views,
    status: row.status,
    statusText: IMAGE_STATUS_TEXT[row.status] || '未知',
    // 驳回原因：仅「已驳回」时非空，创作者中心据此告诉投稿人哪里不合格
    rejectReason: row.reject_reason || '',
    uploader: row.uploader_username
      ? {
          username: row.uploader_username,
          nickname: row.uploader_nickname || row.uploader_username,
        }
      : null,
    storageKey: allowOriginal ? row.storage_key : '',
    storageAccountId: row.storage_account_id,
    packId: row.pack_id ?? null,
    packSort: row.pack_sort ?? 0,
    packCover: Boolean(row.pack_cover),
    // 网盘链接与「登录后下载」同步：未获下载授权时不下发链接，只保留数量供前端展示「登录后查看」
    mirrorCount: mirrors.length,
    mirrors: allowOriginal ? mirrors : [],
    // 多尺寸预览图：[{ width, url }]，前端按屏幕宽度拼 srcset
    variants,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category:
      row.category_id && row.category_name
        ? {
            id: row.category_id,
            name: row.category_name,
            slug: row.category_slug,
            // 详情页的「相关推荐」要跟随该分类的展示样式，故一并下发
            displayStyle: categoryStyle(row.category_display_style),
          }
        : null,
    tags,
  };
}

export function serializeMany(rows, opts = {}) {
  const tagMap = tagsByImage(rows.map((r) => r.id));
  const accounts = accountsMap();
  const cfg = getStorageConfig();
  return rows.map((row) => serializeImage(row, tagMap.get(row.id) || [], accounts, cfg, opts));
}

export function getImageRow(id) {
  return get(`${BASE_SELECT} WHERE i.id = ? AND i.deleted_at = ''`, [id]);
}

export function getImageById(id, opts = {}) {
  const row = getImageRow(id);
  if (!row) throw new HttpError(404, '壁纸不存在');
  return serializeImage(row, tagsByImage([row.id]).get(row.id) || [], null, null, opts);
}

const SORTS = {
  latest: 'i.created_at DESC, i.id DESC',
  popular: 'i.views DESC, i.id DESC',
  downloads: 'i.downloads DESC, i.id DESC',
};

function buildFilters({
  category,
  tag,
  q,
  orientation,
  format,
  minWidth,
  minHeight,
  color,
  dateFrom,
  dateTo,
  status,
  userId,
  packCoversOnly,
  excludeNotInAll,
}) {
  const where = [];
  const params = [];

  // 回收站：软删除的图片（deleted_at 非空）在全部前台/后台列表里都不可见
  where.push("i.deleted_at = ''");

  // 前台列表只展示图包的主图，图包内其余图片仅在详情页里切换查看
  if (packCoversOnly) where.push('(i.pack_id IS NULL OR i.pack_cover = 1)');

  if (status !== undefined && status !== '' && status !== null) {
    // 支持单个状态或用逗号分隔的多个状态
    const list = (Array.isArray(status) ? status : String(status).split(','))
      .map((item) => Number(String(item).trim()))
      .filter((n) => Number.isInteger(n) && n >= 0);
    if (list.length > 0) {
      where.push(`i.status IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
  }
  if (userId) {
    where.push('i.user_id = ?');
    params.push(Number(userId));
  }
  if (category) {
    // 一级分类聚合其下二级分类；二级分类只匹配自身
    const row = get('SELECT id FROM categories WHERE slug = ?', [String(category)]);
    if (!row) {
      where.push('c.slug = ?');
      params.push(category);
    } else {
      const ids = [
        row.id,
        ...all('SELECT id FROM categories WHERE parent_id = ?', [row.id]).map((c) => c.id),
      ];
      where.push(`i.category_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
  }
  // 「全部壁纸」聚合列表（未指定具体分类时）：排除未勾选「加入全部壁纸」的分类，
  // 以及父级分类也关闭了「加入全部壁纸」的图片。分类自己的页面（显式传 category）不受影响。
  if (excludeNotInAll && !category) {
    where.push(`NOT EXISTS (
      SELECT 1 FROM categories x
      WHERE x.show_in_all = 0
        AND (x.id = i.category_id
             OR x.id = (SELECT parent_id FROM categories WHERE id = i.category_id))
    )`);
  }
  if (tag) {
    where.push(
      'EXISTS (SELECT 1 FROM image_tags it JOIN tags t ON t.id = it.tag_id WHERE it.image_id = i.id AND t.slug = ?)',
    );
    params.push(tag);
  }
  if (q) {
    const keyword = String(q).trim();
    // 关键词够长且 FTS5 可用时走全文索引（trigram 按子串匹配，中英文都适用）；
    // 更短的词 trigram 无从匹配，退回 LIKE 扫描
    if (shouldUseFullText(keyword)) {
      where.push('i.id IN (SELECT rowid FROM images_fts WHERE images_fts MATCH ?)');
      params.push(fullTextMatch(keyword));
    } else {
      where.push('(i.title LIKE ? OR i.description LIKE ? OR i.filename LIKE ?)');
      const like = `%${keyword}%`;
      params.push(like, like, like);
    }
  }
  if (orientation === 'landscape') where.push('i.width > i.height');
  else if (orientation === 'portrait') where.push('i.height > i.width');
  else if (orientation === 'square') where.push('i.width = i.height AND i.width > 0');

  // 格式：支持逗号分隔多选（jpg,png…），jpeg 与 jpg 视为同一格式
  if (format) {
    const list = (Array.isArray(format) ? format : String(format).split(','))
      .map((item) => String(item).trim().toLowerCase().replace(/^jpeg$/, 'jpg'))
      .filter(Boolean);
    if (list.length > 0) {
      where.push(
        `REPLACE(LOWER(i.format), 'jpeg', 'jpg') IN (${list.map(() => '?').join(',')})`,
      );
      params.push(...list);
    }
  }

  // 分辨率下限：宽度 / 高度任一满足即可（用户通常只关心「至少多宽」）
  const minW = Number(minWidth);
  if (Number.isFinite(minW) && minW > 0) {
    where.push('i.width >= ?');
    params.push(Math.round(minW));
  }
  const minH = Number(minHeight);
  if (Number.isFinite(minH) && minH > 0) {
    where.push('i.height >= ?');
    params.push(Math.round(minH));
  }

  if (color) {
    where.push('i.color_bucket = ?');
    params.push(String(color).trim().toLowerCase());
  }

  // created_at 是「YYYY-MM-DD HH:mm:ss」本地时间字符串，可直接按字典序比较
  if (dateFrom) {
    where.push('i.created_at >= ?');
    params.push(`${String(dateFrom).slice(0, 10)} 00:00:00`);
  }
  if (dateTo) {
    where.push('i.created_at <= ?');
    params.push(`${String(dateTo).slice(0, 10)} 23:59:59`);
  }

  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export function listImages(options = {}) {
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 24));
  const { clause, params } = buildFilters(options);
  const sort = SORTS[options.sort] || SORTS.latest;

  const total = Number(scalar(`SELECT COUNT(*) FROM images i LEFT JOIN categories c ON c.id = i.category_id ${clause}`, params) ?? 0);
  // 后台需要展示上传者，前台下发的对象里 uploader 恒为 null
  const base = options.withUploader ? BASE_SELECT_WITH_UPLOADER : BASE_SELECT;
  const rows = all(
    `${base} ${clause} ORDER BY ${sort} LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );

  return {
    items: serializeMany(rows, { allowOriginal: options.allowOriginal }),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function randomImages(count = 1, opts = {}) {
  const limit = Math.min(24, Math.max(1, Number(count) || 1));
  const rows = all(
    `${BASE_SELECT} WHERE i.status = 1 AND i.deleted_at = '' AND (i.pack_id IS NULL OR i.pack_cover = 1) ORDER BY RANDOM() LIMIT ?`,
    [limit],
  );
  return serializeMany(rows, { allowOriginal: opts.allowOriginal });
}

function bumpDaily(col) {
  const day = nowStr().slice(0, 10);
  run(
    `INSERT INTO daily_stats (date, ${col}) VALUES (?, 1)
     ON CONFLICT(date) DO UPDATE SET ${col} = ${col} + 1`,
    [day],
  );
}

export function incrementViews(id) {
  run('UPDATE images SET views = views + 1 WHERE id = ?', [id]);
  bumpDaily('views');
}

export function incrementDownloads(id) {
  run('UPDATE images SET downloads = downloads + 1 WHERE id = ?', [id]);
  bumpDaily('downloads');
}

/* ---------------------------------- 写入 ---------------------------------- */

/**
 * 壁纸只能挂在二级分类下：一级分类只作为入口页聚合其下二级分类的壁纸。
 * 未传分类（null / 空串）表示「未分类」，允许通过。
 */
function normalizeCategoryId(value) {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '分类不合法');
  const row = get('SELECT id, parent_id FROM categories WHERE id = ?', [id]);
  if (!row) throw new HttpError(400, '所选分类不存在');
  // 只能挂到「叶子分类」：有下级的一级分类仅作为入口，聚合其下二级分类的壁纸
  if (get('SELECT id FROM categories WHERE parent_id = ? LIMIT 1', [id])) {
    throw new HttpError(400, '该分类下还有二级分类，请选择具体的二级分类');
  }
  return id;
}

export function setImageTags(imageId, tagIds) {
  transaction(() => {
    run('DELETE FROM image_tags WHERE image_id = ?', [imageId]);
    const ids = [...new Set((tagIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    for (const tagId of ids) {
      run('INSERT OR IGNORE INTO image_tags (image_id, tag_id) VALUES (?, ?)', [imageId, tagId]);
    }
  });
}

export function insertImage(data) {
  const now = nowStr();
  const { lastInsertRowid } = run(
    `INSERT INTO images
      (title, description, filename, storage_key, thumb_key, storage_account_id, user_id, url,
       width, height, size, format, category_id, downloads, views, status, created_at, updated_at,
       kind, pack_id, pack_sort, pack_cover, mirrors, dominant_color, color_bucket, phash, variants)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.title,
      data.description || '',
      data.filename,
      data.storageKey,
      data.thumbKey || null,
      data.storageAccountId || null,
      data.userId || null,
      data.url || '',
      data.width || 0,
      data.height || 0,
      data.size || 0,
      data.format || '',
      data.categoryId ? normalizeCategoryId(data.categoryId) : null,
      normalizeStatus(data.status, IMAGE_STATUS.published),
      now,
      now,
      data.kind === 'video' ? 'video' : 'image',
      data.packId || null,
      Number(data.packSort) || 0,
      data.packCover ? 1 : 0,
      JSON.stringify(normalizeMirrors(data.mirrors)),
      data.dominantColor || '',
      data.colorBucket || '',
      data.phash || '',
      JSON.stringify(Array.isArray(data.variants) ? data.variants : []),
    ],
  );
  if (data.tagIds?.length) setImageTags(lastInsertRowid, data.tagIds);
  return lastInsertRowid;
}

/** 更新壁纸的多尺寸变体（上传产出 / 回填任务用） */
export function setImageVariants(id, variants) {
  run('UPDATE images SET variants = ?, updated_at = ? WHERE id = ?', [
    JSON.stringify(Array.isArray(variants) ? variants : []),
    nowStr(),
    id,
  ]);
}

/**
 * 上传查重：按 dHash 汉明距离找出与目标图相似的已入库壁纸。
 * 阈值越小越严格，默认 6（64 位里最多 6 位不同，肉眼基本是同一张）。
 */
export function findSimilarImages(phash, { threshold = 6, limit = 4 } = {}) {
  if (!phash || String(phash).length !== 16) return [];
  const rows = all(
    "SELECT id, title, thumb_key, storage_key, storage_account_id, phash FROM images WHERE phash != '' AND deleted_at = ''",
  );
  const hits = [];
  for (const row of rows) {
    const distance = hammingDistance(row.phash, phash);
    if (distance <= threshold) hits.push({ row, distance });
  }
  hits.sort((a, b) => a.distance - b.distance);
  const accounts = accountsMap();
  return hits.slice(0, limit).map(({ row, distance }) => ({
    id: row.id,
    title: row.title,
    distance,
    url: resolvePublicUrl(row.thumb_key || row.storage_key, row.storage_account_id, accounts) || '',
  }));
}

/**
 * 以图搜图：对上传图的 dHash 指纹做全表汉明距离比对，返回最相似的已发布壁纸。
 * 只扫 id / phash 两列，全表比一遍开销很小；阈值默认 10 以尽量召回近似结果。
 */
export function searchSimilar(phash, { threshold = 10, limit = 24, allowOriginal = false } = {}) {
  const size = Math.min(60, Math.max(1, Number(limit) || 24));
  if (!phash || String(phash).length !== 16) return [];
  const candidates = all(
    "SELECT id, phash FROM images WHERE status = 1 AND phash != '' AND deleted_at = ''",
  );
  const hits = [];
  for (const row of candidates) {
    const distance = hammingDistance(row.phash, phash);
    if (distance <= threshold) hits.push({ id: row.id, distance });
  }
  hits.sort((a, b) => a.distance - b.distance);
  const ids = hits.slice(0, size).map((hit) => hit.id);
  if (ids.length === 0) return [];
  const base = `${BASE_SELECT} WHERE i.status = 1 AND i.deleted_at = '' AND (i.pack_id IS NULL OR i.pack_cover = 1)`;
  const found = all(`${base} AND i.id IN (${ids.map(() => '?').join(',')})`, ids);
  const byId = new Map(found.map((row) => [row.id, row]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  return serializeMany(ordered, { allowOriginal });
}

/** 详情页「相似壁纸」的 dHash 汉明距离阈值：比上传查重（6）略宽，便于凑出推荐位 */
const RELATED_SIMILAR_THRESHOLD = 10;

/**
 * 详情页相关推荐：先找视觉相似的壁纸（dHash 汉明距离），再用同分类、同色系按热度补足。
 * 结果去重且始终排除当前壁纸；相似组只扫 id / phash 两列，全表比一遍的开销很小。
 */
export function relatedImages(id, { limit = 12, allowOriginal = false } = {}) {
  const size = Math.min(24, Math.max(1, Number(limit) || 12));
  const current = get(
    "SELECT id, phash, category_id, color_bucket FROM images WHERE id = ? AND deleted_at = ''",
    [id],
  );
  if (!current) return [];

  const base = `${BASE_SELECT} WHERE i.status = 1 AND i.deleted_at = '' AND (i.pack_id IS NULL OR i.pack_cover = 1)`;
  const picked = new Set([current.id]);
  const rows = [];

  // 1) 视觉相似：距离近的优先
  if (String(current.phash || '').length === 16) {
    const candidates = all(
      "SELECT id, phash FROM images WHERE status = 1 AND phash != '' AND deleted_at = ''",
    );
    const hits = [];
    for (const row of candidates) {
      if (row.id === current.id) continue;
      const distance = hammingDistance(row.phash, current.phash);
      if (distance <= RELATED_SIMILAR_THRESHOLD) hits.push({ id: row.id, distance });
    }
    hits.sort((a, b) => a.distance - b.distance);
    const ids = hits.slice(0, size).map((hit) => hit.id);
    if (ids.length > 0) {
      const found = all(`${base} AND i.id IN (${ids.map(() => '?').join(',')})`, ids);
      const byId = new Map(found.map((row) => [row.id, row]));
      for (const hitId of ids) {
        const row = byId.get(hitId);
        if (!row) continue;
        picked.add(row.id);
        rows.push(row);
      }
    }
  }

  const append = (list) => {
    for (const row of list) {
      if (rows.length >= size) return;
      if (picked.has(row.id)) continue;
      picked.add(row.id);
      rows.push(row);
    }
  };

  // 2) 同分类按热度补足，仍不够再用同色系补足
  if (rows.length < size && current.category_id) {
    append(
      all(`${base} AND i.category_id = ? ORDER BY i.views DESC, i.id DESC LIMIT ?`, [
        current.category_id,
        size,
      ]),
    );
  }
  if (rows.length < size && current.color_bucket) {
    append(
      all(`${base} AND i.color_bucket = ? ORDER BY i.views DESC, i.id DESC LIMIT ?`, [
        current.color_bucket,
        size,
      ]),
    );
  }

  return serializeMany(rows, { allowOriginal });
}

/** 重复图判定阈值：dHash 距离不超过该值即视为同一张图（比上传查重严格一些） */
const DUPLICATE_THRESHOLD = 4;

/**
 * 存量重复图分组：把 dHash 相近的已发布壁纸聚成一组，只返回组内 ≥2 张的组。
 * 先按 phash 排序，相似的哈希前缀一致，故只需回看最近的一小段代表，
 * 避免两两比对的 O(n²) 开销。组内按上传时间升序，最早那张是「保留」的候选。
 */
export function listDuplicateGroups({ threshold, limit } = {}) {
  const maxDistance = Math.min(16, Math.max(0, Number(threshold) || DUPLICATE_THRESHOLD));
  const rows = all(
    `${BASE_SELECT} WHERE i.status = 1 AND i.phash != '' AND i.deleted_at = '' ORDER BY i.phash ASC, i.id ASC`,
  );

  const clusters = [];
  for (const row of rows) {
    let hit = null;
    for (let i = clusters.length - 1; i >= 0 && i >= clusters.length - 200; i -= 1) {
      if (hammingDistance(clusters[i].phash, row.phash) <= maxDistance) {
        hit = clusters[i];
        break;
      }
    }
    if (hit) hit.rows.push(row);
    else clusters.push({ phash: row.phash, rows: [row] });
  }

  const dupes = clusters.filter((cluster) => cluster.rows.length > 1);
  // 冗余张数多的组排前面，方便优先处理
  dupes.sort((a, b) => b.rows.length - a.rows.length);

  const size = Math.min(100, Math.max(1, Number(limit) || 50));
  const groups = dupes.slice(0, size).map((cluster) => {
    const items = cluster.rows
      .slice()
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    return {
      count: items.length,
      // 除最早一张外都算冗余，据此估算可回收的存储
      wastedBytes: items.slice(1).reduce((sum, row) => sum + (Number(row.size) || 0), 0),
      items: serializeMany(items, { allowOriginal: true }),
    };
  });

  return {
    groupCount: dupes.length,
    imageCount: dupes.reduce((sum, cluster) => sum + cluster.rows.length, 0),
    wastedBytes: dupes.reduce(
      (sum, cluster) => sum + cluster.rows.slice(1).reduce((n, row) => n + (Number(row.size) || 0), 0),
      0,
    ),
    groups,
  };
}

/** 新建一个图包分组，返回分组 id */
export function createPack() {
  const now = nowStr();
  const { lastInsertRowid } = run(
    'INSERT INTO packs (created_at, updated_at) VALUES (?, ?)',
    [now, now],
  );
  return lastInsertRowid;
}

/** 图包内的全部图片，按图包内顺序排列 */
export function packItems(packId, opts = {}) {
  if (!packId) return [];
  return serializeMany(
    all(
      `${BASE_SELECT} WHERE i.pack_id = ? AND i.deleted_at = '' ORDER BY i.pack_sort ASC, i.id ASC`,
      [packId],
    ),
    opts,
  );
}

/** 图包内图片的原始行（打包下载用） */
export function packRows(packId) {
  if (!packId) return [];
  return all(
    "SELECT * FROM images WHERE pack_id = ? AND deleted_at = '' ORDER BY pack_sort ASC, id ASC",
    [packId],
  );
}

/** 0/1/2/3 之外的值一律回退到 fallback */
function normalizeStatus(value, fallback) {
  const n = Number(value);
  return [0, 1, 2, 3].includes(n) ? n : fallback;
}

/**
 * 批量改状态：用于审核通过 / 驳回 / 隐藏。
 * 只有「已驳回」才保留驳回原因，其它状态一律清空，避免通过后还挂着旧原因。
 */
export function setImagesStatus(ids, status, rejectReason = '') {
  const list = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (list.length === 0) return 0;
  const next = normalizeStatus(status, IMAGE_STATUS.hidden);
  const placeholders = list.map(() => '?').join(',');
  const { changes } = run(
    `UPDATE images SET status = ?, reject_reason = ?, updated_at = ? WHERE id IN (${placeholders})`,
    [next, normalizeRejectReason(next, rejectReason), nowStr(), ...list],
  );
  return Number(changes ?? 0);
}

/** 驳回原因只在「已驳回」状态下保留，最长 200 字 */
function normalizeRejectReason(status, reason) {
  if (status !== IMAGE_STATUS.rejected) return '';
  return String(reason || '').trim().slice(0, 200);
}

export function updateImage(id, patch) {
  const row = getImageRow(id);
  if (!row) throw new HttpError(404, '壁纸不存在');

  const next = {
    title: patch.title ?? row.title,
    description: patch.description ?? row.description,
    // 只有显式传了 categoryId 才校验，避免历史数据（挂在一级分类下）改标题时被拦
    categoryId:
      patch.categoryId === undefined
        ? row.category_id
        : patch.categoryId
          ? normalizeCategoryId(patch.categoryId)
          : null,
    status: patch.status === undefined ? row.status : normalizeStatus(patch.status, row.status),
  };

  run(
    `UPDATE images SET title = ?, description = ?, category_id = ?, status = ?, reject_reason = ?, mirrors = ?, updated_at = ?
     WHERE id = ?`,
    [
      next.title,
      next.description,
      next.categoryId,
      next.status,
      // 状态被改回非驳回时清掉旧的驳回原因
      normalizeRejectReason(next.status, row.reject_reason),
      JSON.stringify(
        patch.mirrors === undefined ? parseMirrors(row.mirrors) : normalizeMirrors(patch.mirrors),
      ),
      nowStr(),
      id,
    ],
  );

  if (patch.tagIds !== undefined) setImageTags(id, patch.tagIds);

  // 图包的网盘链接挂在主图上，改动时同步给组内其它图片，保证切换图片时链接不丢
  if (patch.mirrors !== undefined && Number(row.pack_cover) === 1 && row.pack_id) {
    run('UPDATE images SET mirrors = ?, updated_at = ? WHERE pack_id = ? AND id != ?', [
      JSON.stringify(normalizeMirrors(patch.mirrors)),
      nowStr(),
      row.pack_id,
      id,
    ]);
  }

  return getImageById(id);
}

/** 删除存储中的文件（原图 + 缩略图 + 多尺寸变体），失败不阻塞数据库删除 */
async function removeFiles(row) {
  const keys = [
    row.storage_key,
    row.thumb_key,
    ...parseVariants(row.variants).map((item) => item?.key),
  ].filter(Boolean);
  if (keys.length === 0) return;

  if (row.storage_account_id) {
    const account = getAccount(row.storage_account_id);
    if (!account) return;
    const adapter = createRemoteStorage(account);
    for (const key of keys) {
      await adapter.remove(key).catch(() => {});
    }
    return;
  }

  const adapter = createLocalStorage(getStorageConfig().local);
  for (const key of keys) {
    await adapter.remove(key).catch(() => {});
  }
}

/**
 * 删除壁纸 = 移入回收站（软删除）：只标记 deleted_at，原图与数据都保留，
 * 后台可在回收站里恢复；超期后由维护任务彻底删除。
 */
export function deleteImages(ids) {
  const list = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n)))];
  if (list.length === 0) return 0;

  const placeholders = list.map(() => '?').join(',');
  const rows = all(
    `SELECT id, pack_id FROM images WHERE id IN (${placeholders}) AND deleted_at = ''`,
    list,
  );
  if (rows.length === 0) return 0;

  const now = nowStr();
  transaction(() => {
    run(
      `UPDATE images SET deleted_at = ?, updated_at = ? WHERE id IN (${placeholders}) AND deleted_at = ''`,
      [now, now, ...list],
    );
    cleanupPacks([...new Set(rows.map((r) => r.pack_id).filter(Boolean))]);
  });
  return rows.length;
}

/** 从回收站恢复：清空 deleted_at */
export function restoreImages(ids) {
  const list = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n)))];
  if (list.length === 0) return 0;
  const placeholders = list.map(() => '?').join(',');
  const { changes } = run(
    `UPDATE images SET deleted_at = '', updated_at = ? WHERE id IN (${placeholders}) AND deleted_at != ''`,
    [nowStr(), ...list],
  );
  return Number(changes ?? 0);
}

/** 彻底删除：连同存储中的文件一起删掉，不可恢复 */
export async function purgeImages(ids) {
  const list = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n)))];
  if (list.length === 0) return 0;

  const placeholders = list.map(() => '?').join(',');
  const rows = all(`SELECT * FROM images WHERE id IN (${placeholders})`, list);
  if (rows.length === 0) return 0;

  for (const row of rows) {
    await removeFiles(row);
  }

  const packIds = [...new Set(rows.map((r) => r.pack_id).filter(Boolean))];

  transaction(() => {
    run(`DELETE FROM image_tags WHERE image_id IN (${placeholders})`, list);
    run(`DELETE FROM images WHERE id IN (${placeholders})`, list);
    // 图包内已无任何图片记录（含回收站）时才删除分组
    for (const packId of packIds) {
      if (!get('SELECT id FROM images WHERE pack_id = ? LIMIT 1', [packId])) {
        run('DELETE FROM packs WHERE id = ?', [packId]);
      }
    }
  });
  return rows.length;
}

/** 回收站保留天数：超过后由维护任务自动彻底删除 */
export const TRASH_KEEP_DAYS = 30;

/** 清理超期回收站：返回被彻底删除的数量 */
export async function purgeExpiredTrash(days = TRASH_KEEP_DAYS) {
  const before = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  const cutoff = `${before.getFullYear()}-${p(before.getMonth() + 1)}-${p(before.getDate())} ${p(
    before.getHours(),
  )}:${p(before.getMinutes())}:${p(before.getSeconds())}`;
  const rows = all("SELECT id FROM images WHERE deleted_at != '' AND deleted_at < ?", [cutoff]);
  if (rows.length === 0) return 0;
  return purgeImages(rows.map((r) => r.id));
}

/**
 * 图包主图被移入回收站后，把顺序最靠前的一张非删除图片提升为主图，
 * 避免整个图包在前台列表里消失。分组本身留到「彻底删除」时再清理。
 */
function cleanupPacks(packIds) {
  for (const packId of packIds) {
    const remain = all(
      "SELECT id, pack_cover FROM images WHERE pack_id = ? AND deleted_at = '' ORDER BY pack_sort ASC, id ASC",
      [packId],
    );
    if (remain.length === 0) continue;
    if (!remain.some((r) => Number(r.pack_cover) === 1)) {
      run('UPDATE images SET pack_cover = 1 WHERE id = ?', [remain[0].id]);
    }
  }
}

/** 后台回收站列表：只列出已软删除的图片，按删除时间倒序 */
export function listDeletedImages(options = {}) {
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 24));
  const where = ["i.deleted_at != ''"];
  const params = [];
  if (options.q) {
    where.push('(i.title LIKE ? OR i.filename LIKE ?)');
    params.push(`%${String(options.q).trim()}%`, `%${String(options.q).trim()}%`);
  }
  const clause = `WHERE ${where.join(' AND ')}`;
  const total = Number(
    scalar(`SELECT COUNT(*) FROM images i ${clause}`, params) ?? 0,
  );
  const rows = all(
    `${BASE_SELECT_WITH_UPLOADER} ${clause} ORDER BY i.deleted_at DESC, i.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return {
    items: serializeMany(rows, { allowOriginal: true }),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * 后台批量编辑：分类 / 状态 / 标签增删。
 * patch 里未出现的字段不做改动；categoryId 传 null 表示清空分类。
 * 返回受影响的壁纸数量。
 */
export function batchUpdateImages(ids, patch = {}) {
  const list = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (list.length === 0) return 0;

  const placeholders = list.map(() => '?').join(',');
  const now = nowStr();

  if (patch.categoryId !== undefined) {
    const categoryId = patch.categoryId ? normalizeCategoryId(patch.categoryId) : null;
    run(`UPDATE images SET category_id = ?, updated_at = ? WHERE id IN (${placeholders})`, [
      categoryId,
      now,
      ...list,
    ]);
  }
  if (patch.status !== undefined) {
    run(`UPDATE images SET status = ?, reject_reason = ?, updated_at = ? WHERE id IN (${placeholders})`, [
      normalizeStatus(patch.status, IMAGE_STATUS.hidden),
      // 批量改状态不带驳回原因，只保证离开「已驳回」时清掉旧原因
      normalizeRejectReason(Number(patch.status), ''),
      now,
      ...list,
    ]);
  }

  // 只接受库里真实存在的标签，避免写进悬空的 image_tags
  const knownTags = (value) => {
    const wanted = [...new Set((value || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (wanted.length === 0) return [];
    return all(
      `SELECT id FROM tags WHERE id IN (${wanted.map(() => '?').join(',')})`,
      wanted,
    ).map((row) => row.id);
  };
  const addTagIds = knownTags(patch.addTagIds);
  const removeTagIds = knownTags(patch.removeTagIds);

  if (addTagIds.length > 0 || removeTagIds.length > 0) {
    transaction(() => {
      for (const imageId of list) {
        for (const tagId of addTagIds) {
          run('INSERT OR IGNORE INTO image_tags (image_id, tag_id) VALUES (?, ?)', [imageId, tagId]);
        }
      }
      if (removeTagIds.length > 0) {
        run(
          `DELETE FROM image_tags WHERE image_id IN (${placeholders})
             AND tag_id IN (${removeTagIds.map(() => '?').join(',')})`,
          [...list, ...removeTagIds],
        );
      }
    });
  }

  return list.length;
}

/** 后台统计（回收站里的图片不计入内容统计，单独给 trash 数量） */
export function stats() {
  const one = (sql) => Number(scalar(sql) ?? 0);
  return {
    images: one("SELECT COUNT(*) FROM images WHERE deleted_at = ''"),
    published: one("SELECT COUNT(*) FROM images WHERE status = 1 AND deleted_at = ''"),
    hidden: one("SELECT COUNT(*) FROM images WHERE status = 0 AND deleted_at = ''"),
    pending: one("SELECT COUNT(*) FROM images WHERE status = 2 AND deleted_at = ''"),
    rejected: one("SELECT COUNT(*) FROM images WHERE status = 3 AND deleted_at = ''"),
    trash: one("SELECT COUNT(*) FROM images WHERE deleted_at != ''"),
    categories: one('SELECT COUNT(*) FROM categories'),
    tags: one('SELECT COUNT(*) FROM tags'),
    users: one('SELECT COUNT(*) FROM users'),
    downloads: one("SELECT COALESCE(SUM(downloads), 0) FROM images WHERE deleted_at = ''"),
    views: one("SELECT COALESCE(SUM(views), 0) FROM images WHERE deleted_at = ''"),
    totalSize: one("SELECT COALESCE(SUM(size), 0) FROM images WHERE deleted_at = ''"),
    accounts: Number(scalar('SELECT COUNT(*) FROM storage_accounts') ?? 0),
  };
}

/** 近 N 天逐日趋势：下载 / 浏览 / 注册（注册数直接按 users.created_at 归属到日期） */
export function statsTrend(days = 30) {
  const n = Math.min(90, Math.max(1, Number(days) || 30));
  const p = (v) => String(v).padStart(2, '0');
  const dates = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dates.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  }
  const start = dates[0];
  const daily = new Map(
    all('SELECT date, downloads, views FROM daily_stats WHERE date >= ?', [start]).map((r) => [
      r.date,
      r,
    ]),
  );
  const regs = new Map(
    all(
      "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY day",
      [start],
    ).map((r) => [r.day, Number(r.n)]),
  );
  return dates.map((date) => ({
    date,
    downloads: Number(daily.get(date)?.downloads) || 0,
    views: Number(daily.get(date)?.views) || 0,
    registrations: Number(regs.get(date)) || 0,
  }));
}
