import path from 'node:path';
import { randomId } from '../lib/crypto.js';

/** image-size 是 CJS 包，兼容 default / 具名导出两种形态 */
let imageSizeFn = null;
async function getImageSize() {
  if (!imageSizeFn) {
    const mod = await import('image-size');
    imageSizeFn = mod.imageSize || mod.default || mod;
  }
  return imageSizeFn;
}

/** sharp 为可选依赖，未安装时自动降级为「不生成缩略图」 */
let sharpFn;
let sharpResolved = false;
async function getSharp() {
  if (!sharpResolved) {
    sharpResolved = true;
    try {
      sharpFn = (await import('sharp')).default;
    } catch {
      sharpFn = null;
    }
  }
  return sharpFn;
}

export async function hasSharp() {
  return Boolean(await getSharp());
}

const EXT_BY_TYPE = {
  jpg: 'jpg',
  jpeg: 'jpg',
  png: 'png',
  gif: 'gif',
  webp: 'webp',
  avif: 'avif',
  bmp: 'bmp',
  tiff: 'tiff',
  svg: 'svg',
  ico: 'ico',
  heic: 'heic',
  heif: 'heif',
};

const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  heic: 'image/heic',
  // 视频壁纸
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
};

/** 支持的视频扩展名（浏览器可直接播放的排前面） */
const VIDEO_EXTS = new Set(['mp4', 'm4v', 'webm', 'ogv', 'mov', 'mkv', 'avi']);

/** 是否为视频壁纸 */
export function isVideoExt(ext) {
  return VIDEO_EXTS.has(String(ext || '').toLowerCase());
}

/** 从 MIME 类型推断扩展名，仅用于视频（图片仍然按真实内容解析） */
export function extFromMimetype(mimetype) {
  const mime = String(mimetype || '').toLowerCase();
  const hit = Object.entries(MIME_BY_EXT).find(([, value]) => value === mime);
  return hit ? hit[0] : '';
}

export function extFromFilename(filename) {
  const ext = path.extname(String(filename || '')).replace('.', '').toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

export function contentTypeForExt(ext) {
  return MIME_BY_EXT[String(ext).toLowerCase()] || 'application/octet-stream';
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[i]}`;
}

/**
 * 解析图片宽高与真实格式。
 * 非图片或无法解析时抛错，由调用方转为 400。
 */
export async function extractMetadata(buffer) {
  const imageSize = await getImageSize();
  let info;
  try {
    info = imageSize(buffer);
  } catch {
    throw new Error('无法识别的图片格式');
  }
  if (!info || (!info.width && !info.height && !info.type)) {
    throw new Error('无法解析图片尺寸');
  }
  const type = String(info.type || '').toLowerCase();
  return {
    width: Number(info.width) || 0,
    height: Number(info.height) || 0,
    format: type === 'jpg' ? 'jpeg' : type || 'unknown',
    ext: EXT_BY_TYPE[type] || 'jpg',
  };
}

/**
 * 生成缩略图（webp，限制最大宽度）。
 * 未安装 sharp 或生成失败时返回 null，前端会退回使用原图。
 */
export async function makeThumbnail(buffer, { maxWidth = 720, quality = 78 } = {}) {
  const sharp = await getSharp();
  if (!sharp) return null;
  try {
    const out = await sharp(buffer)
      .rotate()
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    return out;
  } catch {
    return null;
  }
}

/** 多尺寸预览图的宽度档位（用于 srcset 按屏幕宽度挑选） */
export const VARIANT_WIDTHS = [1280, 1920, 2560];

/**
 * 生成多尺寸 webp 变体，用于前端 srcset 按屏幕宽度挑选合适的文件，
 * 避免所有设备都去拉十几 MB 的原图。
 * 只生成小于原图宽度的档位（不放大），sharp 不可用或某档失败时跳过该档。
 * @returns {Promise<Array<{ width: number, buffer: Buffer }>>}
 */
export async function makeVariants(buffer, { widths = VARIANT_WIDTHS, quality = 82, originalWidth = 0 } = {}) {
  const sharp = await getSharp();
  if (!sharp) return [];
  const out = [];
  for (const width of widths) {
    if (originalWidth && width >= originalWidth) continue;
    try {
      const data = await sharp(buffer)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
      out.push({ width, buffer: data });
    } catch {
      // 单个档位失败不影响其它档位
    }
  }
  return out;
}

/**
 * 生成方形头像（webp）。未安装 sharp 时返回 null，调用方退回保存原图。
 */
export async function makeAvatar(buffer, { size = 256, quality = 82 } = {}) {
  const sharp = await getSharp();
  if (!sharp) return null;
  try {
    return await sharp(buffer)
      .rotate()
      .resize(size, size, { fit: 'cover', position: 'attention' })
      .webp({ quality })
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * 主色分桶：前台按这些固定颜色筛选，避免让用户输入任意色值。
 * 黑白灰走明度判断，其余按色相归类。
 */
export const COLOR_BUCKETS = [
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'purple',
  'pink',
  'brown',
  'gray',
  'black',
  'white',
];

function toHex(n) {
  return Math.min(255, Math.max(0, Math.round(Number(n) || 0)))
    .toString(16)
    .padStart(2, '0');
}

/** RGB → #rrggbb */
export function rgbToHex(r, g, b) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** 按 HSL 把颜色归入固定分桶（饱和度低 → 黑白灰） */
export function colorBucketOf(r, g, b) {
  const rn = Number(r) / 255;
  const gn = Number(g) / 255;
  const bn = Number(b) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  if (saturation < 0.12) {
    if (lightness < 0.16) return 'black';
    if (lightness > 0.92) return 'white';
    return 'gray';
  }

  let hue;
  if (max === rn) hue = ((gn - bn) / delta) % 6;
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;
  hue = (hue * 60 + 360) % 360;

  // 深且偏暖的橙色统一算棕色，更符合肉眼感受
  if ((hue < 45 || hue >= 345) && lightness < 0.3) return 'brown';
  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 165) return 'green';
  if (hue < 195) return 'cyan';
  if (hue < 260) return 'blue';
  if (hue < 290) return 'purple';
  return 'pink';
}

/**
 * 取图片主色：返回 { hex, bucket }；sharp 不可用或解析失败时返回 null，
 * 此时该图不参与「按颜色筛选」。
 */
export async function extractColor(buffer) {
  const sharp = await getSharp();
  if (!sharp) return null;
  try {
    const { dominant } = await sharp(buffer).stats();
    if (!dominant) return null;
    return {
      hex: rgbToHex(dominant.r, dominant.g, dominant.b),
      bucket: colorBucketOf(dominant.r, dominant.g, dominant.b),
    };
  } catch {
    return null;
  }
}

/**
 * 感知哈希（dHash）：缩成 9x8 灰度后比较左右相邻像素，得到 64 位指纹（16 位十六进制）。
 * 用于上传时判断「疑似重复」。sharp 不可用时返回空串。
 */
export async function perceptualHash(buffer) {
  const sharp = await getSharp();
  if (!sharp) return '';
  try {
    const { data } = await sharp(buffer)
      .rotate()
      .resize(9, 8, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let bits = '';
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        bits += data[y * 9 + x] > data[y * 9 + x + 1] ? '1' : '0';
      }
    }
    return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
  } catch {
    return '';
  }
}

/** 两个 dHash 的汉明距离；任一为空或长度不一致时返回 64（视为完全不同） */
export function hammingDistance(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x.length !== 16 || y.length !== 16) return 64;
  let diff = 0;
  for (let i = 0; i < 16; i += 1) {
    let v = parseInt(x[i], 16) ^ parseInt(y[i], 16);
    while (v) {
      diff += v & 1;
      v >>= 1;
    }
  }
  return diff;
}

/** 生成对象存储 key：originals/2026/09/<id>.jpg */
export function buildObjectKey(kind, ext, date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const dir = `${date.getFullYear()}/${p(date.getMonth() + 1)}`;
  return `${kind}/${dir}/${randomId(10)}.${ext}`;
}

/** 生成缩略图 key（与原图同目录） */
export function buildThumbKey(originalKey) {
  const dir = path.posix.dirname(originalKey);
  return `${dir}/${path.posix.basename(originalKey).replace(/\.[^.]+$/, '')}_thumb.webp`;
}

/** 生成多尺寸变体 key（与原图同目录，带宽度后缀） */
export function buildVariantKey(originalKey, width) {
  const dir = path.posix.dirname(originalKey);
  return `${dir}/${path.posix.basename(originalKey).replace(/\.[^.]+$/, '')}_w${width}.webp`;
}

/** Content-Disposition 附件头，兼容中文文件名 */
export function attachmentHeader(filename) {
  const safe = String(filename || 'wallpaper').replace(/[\r\n"]/g, '');
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
