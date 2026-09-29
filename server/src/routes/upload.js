import path from 'node:path';
import { HttpError, badRequest } from '../lib/http.js';
import {
  buildObjectKey,
  buildThumbKey,
  buildVariantKey,
  contentTypeForExt,
  extFromFilename,
  extFromMimetype,
  extractColor,
  extractMetadata,
  isVideoExt,
  makeThumbnail,
  makeVariants,
  perceptualHash,
} from '../services/media.js';
import {
  createPack,
  findSimilarImages,
  getImageRow,
  insertImage,
  normalizeMirrors,
  serializeMany,
  IMAGE_STATUS,
} from '../services/images.js';
import { getStorage } from '../services/storage/index.js';

/** tagIds 支持数组、逗号分隔字符串两种形式 */
function parseTagIds(value) {
  if (value === undefined || value === null) return undefined;
  const flat = (Array.isArray(value) ? value : [value])
    .flatMap((v) => String(v).split(','))
    .map((s) => Number(String(s).trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(flat)];
}

function parseCategoryId(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function baseName(filename) {
  return path.basename(String(filename || 'wallpaper'), path.extname(String(filename || '')));
}

/**
 * 取某个字段的值：一次传多图时同名字段会收成数组，按文件下标取值；
 * 一张图一个请求时字段就是普通字符串。
 */
function fieldAt(fields, key, index) {
  const value = fields[key];
  if (value === undefined) return '';
  if (Array.isArray(value)) return String(value[index] ?? '').trim();
  return String(value).trim();
}

export default async function uploadRoutes(app) {
  /**
   * 上传壁纸：需要「上传壁纸」权限；无「上传免审」权限时进入待审核队列。
   * 支持一次上传多张组成图包（pack=1 + coverIndex 指定主图），也支持视频壁纸
   * （poster_<i> 字段传前端截取的首帧作为封面）。
   */
  app.post('/api/upload', { onRequest: [app.requirePermission('upload')] }, async (req) => {
    if (!req.isMultipart()) throw badRequest('请使用 multipart/form-data 上传文件');

    // 有免审权限直接发布，否则先入库等待审核
    const pending = !req.permissions?.skipAudit;
    const status = pending ? IMAGE_STATUS.pending : IMAGE_STATUS.published;

    const fields = {};
    const mainFiles = [];
    const posters = new Map();

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        if (buffer.length === 0) continue;
        const field = part.fieldname || 'file';
        const posterMatch = /^poster_(\d+)$/.exec(field);
        if (posterMatch) {
          posters.set(Number(posterMatch[1]), {
            filename: part.filename,
            mimetype: part.mimetype,
            buffer,
          });
          continue;
        }
        const fileMatch = /^file_(\d+)$/.exec(field);
        mainFiles.push({
          index: fileMatch ? Number(fileMatch[1]) : mainFiles.length,
          filename: part.filename,
          mimetype: part.mimetype,
          buffer,
        });
      } else if (fields[part.fieldname] === undefined) {
        fields[part.fieldname] = part.value;
      } else if (Array.isArray(fields[part.fieldname])) {
        fields[part.fieldname].push(part.value);
      } else {
        fields[part.fieldname] = [fields[part.fieldname], part.value];
      }
    }

    if (mainFiles.length === 0) throw badRequest('没有收到任何文件');
    mainFiles.sort((a, b) => a.index - b.index);

    const tagIds = parseTagIds(fields.tagIds);
    const categoryId = parseCategoryId(fields.categoryId);
    if (!categoryId) throw badRequest('请选择分类后再发布');

    const mirrors = normalizeMirrors(fields.mirrors);
    // 检测到疑似重复时前端会询问，确认后带 force=1 重新提交
    const force = String(fields.force ?? '') === '1';
    // 只有在明确标记成图包且确实有多张时才建立分组，否则保持「一次多张 = 多张独立壁纸」的老行为
    const asPack = String(fields.pack ?? '') === '1' && mainFiles.length > 1;
    const coverIndex = Number(fields.coverIndex) || 0;
    const packId = asPack ? createPack() : null;

    const { storage } = getStorage();
    const items = [];
    const failed = [];
    const duplicates = [];

    for (let i = 0; i < mainFiles.length; i += 1) {
      const file = mainFiles[i];
      try {
        const poster = posters.get(file.index) || null;
        const declaredExt = extFromFilename(file.filename) || extFromMimetype(file.mimetype);
        const isVideo = isVideoExt(declaredExt) || String(file.mimetype || '').startsWith('video/');

        let width = 0;
        let height = 0;
        let format = declaredExt || 'jpg';
        let ext = declaredExt || 'jpg';
        let thumbBuffer = null;

        if (isVideo) {
          if (!isVideoExt(ext)) throw new Error('不支持的视频格式，请上传 mp4 / webm / mov 等常见格式');
          if (poster) {
            // 封面是前端用 canvas 截的首帧，顺便拿到视频的展示尺寸
            const posterMeta = await extractMetadata(poster.buffer).catch(() => null);
            if (posterMeta) {
              width = posterMeta.width;
              height = posterMeta.height;
            }
            thumbBuffer = await makeThumbnail(poster.buffer);
            // 兜底：sharp 不可用时直接存封面原图
            if (!thumbBuffer) thumbBuffer = poster.buffer;
          }
        } else {
          const meta = await extractMetadata(file.buffer);
          if (!meta.width || !meta.height) throw new Error('无法读取图片尺寸，请确认是有效的图片文件');
          width = meta.width;
          height = meta.height;
          format = meta.format;
          ext = meta.ext;
          thumbBuffer = await makeThumbnail(file.buffer);
        }

        // 查重 + 取主色都在原图缓冲上完成，命中重复时直接跳过上传，省掉一次无用的对象存储写入
        const phash = isVideo ? '' : await perceptualHash(file.buffer);
        if (phash && !force) {
          const similar = findSimilarImages(phash);
          if (similar.length > 0) {
            duplicates.push({ name: file.filename, similar });
            continue;
          }
        }
        const color = await extractColor(isVideo ? poster?.buffer : file.buffer);

        const originalKey = buildObjectKey('originals', ext);
        const thumbKey = thumbBuffer ? buildThumbKey(originalKey) : null;

        const original = await storage.put(
          originalKey,
          file.buffer,
          contentTypeForExt(ext),
        );

        // 缩略图必须跟随原图落在同一个存储账号：池化策略下若重新挑账号，
        // 地址会按原图账号解析，缩略图就会 404。
        let savedThumbKey = null;
        if (thumbKey && thumbBuffer) {
          try {
            await storage.put(thumbKey, thumbBuffer, 'image/webp', {
              accountId: original.accountId,
            });
            savedThumbKey = thumbKey;
          } catch {
            // 缩略图失败不影响原图入库，前端会退回使用原图
          }
        }

        // 多尺寸预览图：供前端 srcset 按屏幕宽度挑选，避免去拉十几 MB 的原图。
        // GIF 跳过（webp 变体会丢动画，仍走原图播放）；下载接口始终返回原图。
        const variantKeys = [];
        if (!isVideo && String(format).toLowerCase() !== 'gif') {
          const variants = await makeVariants(file.buffer, { originalWidth: width });
          for (const variant of variants) {
            const key = buildVariantKey(originalKey, variant.width);
            try {
              await storage.put(key, variant.buffer, 'image/webp', {
                accountId: original.accountId,
              });
              variantKeys.push({ width: variant.width, key });
            } catch {
              // 单个档位失败不影响入库，前端会退回用原图/缩略图
            }
          }
        }

        // 逐张自定义：一次传多图时 title / description 可各传一个数组按下标对应
        const titlePrefix = fieldAt(fields, 'title', i);
        const title =
          titlePrefix && mainFiles.length > 1
            ? `${titlePrefix} ${i + 1}`
            : titlePrefix || baseName(file.filename);

        const id = insertImage({
          title,
          description: fieldAt(fields, 'description', i),
          filename: file.filename || `${title}.${ext}`,
          storageKey: originalKey,
          thumbKey: savedThumbKey,
          storageAccountId: original.accountId,
          userId: req.user.sub,
          url: '',
          width,
          height,
          size: file.buffer.length,
          format,
          kind: isVideo ? 'video' : 'image',
          categoryId,
          tagIds,
          status,
          packId,
          packSort: i,
          packCover: Boolean(asPack && i === coverIndex),
          mirrors,
          dominantColor: color?.hex || '',
          colorBucket: color?.bucket || '',
          phash,
          variants: variantKeys,
        });

        items.push(serializeMany([getImageRow(id)])[0]);
      } catch (err) {
        failed.push({ name: file.filename, error: err.message || '上传失败' });
      }
    }

    if (items.length === 0 && failed.length > 0) {
      throw new HttpError(400, failed[0].error);
    }
    return { items, failed, duplicates, pending, status, packId };
  });
}
