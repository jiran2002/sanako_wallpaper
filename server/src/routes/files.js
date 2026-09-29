import { createLocalStorage } from '../services/storage/local.js';
import { getStorageConfig } from '../services/settings.js';
import { contentTypeForExt, extFromFilename } from '../services/media.js';
import { notFound } from '../lib/http.js';

/** 从公开地址中取出路径前缀，例如 https://cdn.x.com/uploads -> /uploads */
function pathnameOf(publicUrl) {
  const raw = String(publicUrl || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).pathname;
  } catch {
    return raw.startsWith('/') ? raw : `/${raw}`;
  }
}

/**
 * 本机存储的文件访问路由。
 * 固定提供 /uploads/*，另外按当前设置里的公开路径追加一个别名。
 */
export default async function fileRoutes(app) {
  const prefixes = new Set(['/uploads']);
  const configured = pathnameOf(getStorageConfig().local.publicUrl).replace(/\/+$/, '');
  if (configured && configured !== '/') prefixes.add(configured);

  for (const prefix of prefixes) {
    app.get(`${prefix}/*`, async (req, reply) => {
      const key = req.params['*'];
      if (!key) throw notFound('文件不存在');

      const adapter = createLocalStorage(getStorageConfig().local);
      const info = await adapter.stat(key).catch(() => null);
      if (!info) throw notFound('文件不存在');

      reply.header('Content-Type', contentTypeForExt(extFromFilename(key)));
      reply.header('Content-Length', String(info.size));
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      return reply.send(adapter.createReadStream(key));
    });
  }
}
