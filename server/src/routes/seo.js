import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { all } from '../db.js';
import { getImageRow, serializeImage } from '../services/images.js';
import { getSiteConfig } from '../services/settings.js';

/** sitemap 最多列出的壁纸数，避免大站生成过大的文件 */
const SITEMAP_LIMIT = 5000;

/** HTML 转义：标题 / 描述来自用户，可能含 < > & " 等字符 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 拼绝对地址：og:image 之类的标签必须是完整 URL 才生效 */
function absoluteUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `${config.publicBaseUrl}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

/**
 * 读取前端构建产物 index.html，替换掉默认 <title> 并注入一段 HTML。
 * 返回 null 表示前端尚未构建，调用方自行兜底。
 */
function renderIndexHtml(headHtml) {
  const file = path.join(config.webDist, 'index.html');
  if (!fs.existsSync(file)) return null;
  const html = fs
    .readFileSync(file, 'utf8')
    // 默认标题会被注入的标题覆盖，先去重，避免出现两个 <title>
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '');
  return html.includes('</head>')
    ? html.replace('</head>', `    ${headHtml}\n  </head>`)
    : html;
}

/**
 * SEO 相关路由：
 * - /robots.txt、/sitemap.xml 给搜索引擎
 * - /image/:id 直达详情页（前端是 SPA，这里直接在 index.html 里注入 og 标签，
 *   分享到社交平台时才有正确的标题与封面图）
 */
export default async function seoRoutes(app) {
  /* ------------------------------- robots.txt ------------------------------- */
  app.get('/robots.txt', async (req, reply) => {
    reply.header('Content-Type', 'text/plain; charset=utf-8');
    reply.header('Cache-Control', 'public, max-age=86400');
    return [
      'User-agent: *',
      'Disallow: /admin',
      'Disallow: /api/',
      'Allow: /',
      '',
      `Sitemap: ${config.publicBaseUrl}/sitemap.xml`,
      '',
    ].join('\n');
  });

  /* ------------------------------- sitemap.xml ------------------------------ */
  app.get('/sitemap.xml', async (req, reply) => {
    const urls = [];
    const push = (loc, lastmod, changefreq, priority) => {
      urls.push(
        `  <url><loc>${escapeHtml(loc)}</loc>` +
          (lastmod ? `<lastmod>${String(lastmod).slice(0, 10)}</lastmod>` : '') +
          `<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`,
      );
    };

    push(`${config.publicBaseUrl}/`, '', 'daily', '1.0');
    push(`${config.publicBaseUrl}/wallpapers`, '', 'daily', '0.8');

    for (const row of all('SELECT slug FROM categories ORDER BY sort_order ASC, id ASC')) {
      push(`${config.publicBaseUrl}/category/${encodeURIComponent(row.slug)}`, '', 'weekly', '0.6');
    }
    for (const row of all('SELECT slug FROM tags ORDER BY id ASC')) {
      push(`${config.publicBaseUrl}/tag/${encodeURIComponent(row.slug)}`, '', 'weekly', '0.5');
    }
    for (const row of all(
      "SELECT id, updated_at FROM images WHERE status = 1 AND deleted_at = '' ORDER BY id DESC LIMIT ?",
      [SITEMAP_LIMIT],
    )) {
      push(`${config.publicBaseUrl}/image/${row.id}`, row.updated_at, 'weekly', '0.7');
    }

    reply.header('Content-Type', 'application/xml; charset=utf-8');
    reply.header('Cache-Control', 'public, max-age=3600');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  });

  /* --------------------------- 详情页的服务端渲染 --------------------------- */
  app.get('/image/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const site = getSiteConfig();
    const row = Number.isInteger(id) ? getImageRow(id) : null;
    // 未发布 / 不存在时只给站点默认信息，页面本身由前端展示「壁纸不存在」
    const image =
      row && Number(row.status) === 1
        ? serializeImage(row, [], null, null, { allowOriginal: false })
        : null;

    const title = image ? `${image.title || '未命名壁纸'} - ${site.title}` : site.title;
    const description = (
      image
        ? image.description ||
          `${image.width}×${image.height} ${String(image.format || '').toUpperCase()} 高清壁纸，免费下载`
        : site.description
    ).slice(0, 150);
    const cover = image ? absoluteUrl(image.thumbUrl || image.url) : '';

    const head = [
      `<title>${escapeHtml(title)}</title>`,
      `<meta name="description" content="${escapeHtml(description)}" />`,
      `<meta property="og:type" content="article" />`,
      `<meta property="og:site_name" content="${escapeHtml(site.title)}" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      `<meta property="og:url" content="${escapeHtml(`${config.publicBaseUrl}/image/${id}`)}" />`,
      cover ? `<meta property="og:image" content="${escapeHtml(cover)}" />` : '',
      '<meta name="twitter:card" content="summary_large_image" />',
    ]
      .filter(Boolean)
      .join('\n    ');

    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.header('Cache-Control', 'public, max-age=300');

    const html = renderIndexHtml(head);
    if (html) return html;
    return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    ${head}
  </head>
  <body>
    <p>前端尚未构建：请在 web/ 目录执行 npm run build，或访问开发服务器 http://localhost:5173</p>
  </body>
</html>`;
  });
}