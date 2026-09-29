import crypto from 'node:crypto';

/**
 * 图形验证码（SVG，无需额外图像依赖）。
 * 内存存储、一次性使用、5 分钟有效，用于注册与游客下载验证。
 */
const store = new Map(); // id -> { code, expiresAt }

// 去除易混淆的 0/O、1/I/L 等字符
const CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function randomCode(len = 4) {
  const buf = crypto.randomBytes(len * 4);
  let out = '';
  for (let i = 0; i < len; i += 1) out += CHARS[buf[i] % CHARS.length];
  return out;
}

/** 生成长度为 N 的单字符 SVG 片段（随机旋转 + 偏移 + 颜色） */
function renderSvg(code) {
  const width = 120;
  const height = 42;
  const step = width / code.length;
  const chars = [...code].map((ch, i) => {
    const x = step * i + step / 2;
    const y = height / 2;
    const rotate = Math.floor(Math.random() * 60) - 30; // -30° ~ +30°
    const color = `hsl(${Math.floor(Math.random() * 360)}, 60%, 40%)`;
    return `<text x="${x.toFixed(1)}" y="${y + 6}" font-size="26" fill="${color}" text-anchor="middle" font-family="monospace" font-weight="700" transform="rotate(${rotate} ${x.toFixed(1)} ${y.toFixed(1)})">${ch}</text>`;
  }).join('');
  // 随机干扰线
  let lines = '';
  for (let i = 0; i < 4; i += 1) {
    const y = Math.floor(Math.random() * height);
    lines += `<line x1="0" y1="${y}" x2="${width}" y2="${height - y}" stroke="hsl(${Math.floor(Math.random() * 360)}, 50%, 70%)" stroke-width="1" opacity="0.6" />`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f1f5f9" rx="6"/>${lines}${chars}</svg>`;
}

/** 生成一张验证码并返回 { id, svg }；过期项顺带清理 */
export function createCaptcha() {
  const now = Date.now();
  for (const [key, value] of store) {
    if (value.expiresAt < now) store.delete(key);
  }
  const code = randomCode(4);
  const id = crypto.randomBytes(12).toString('hex');
  store.set(id, { code, expiresAt: now + 5 * 60 * 1000 });
  return { id, svg: renderSvg(code) };
}

/** 校验验证码（一次性，验证后无论对错都作废该 id） */
export function verifyCaptcha(id, input) {
  const record = store.get(id);
  if (!record) return false;
  store.delete(id);
  if (Date.now() > record.expiresAt) return false;
  return String(input || '').trim().toUpperCase() === record.code;
}