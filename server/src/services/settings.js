import { get, run } from '../db.js';
import { config } from '../config.js';
import { nowStr } from '../lib/utils.js';

function readJson(key, fallback) {
  const row = get('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return structuredClone(fallback);
  try {
    return { ...structuredClone(fallback), ...JSON.parse(row.value) };
  } catch {
    return structuredClone(fallback);
  }
}

function writeJson(key, value) {
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), nowStr()],
  );
}

/** 注册/下载验证码模式 */
export const REGISTER_CODE_MODES = new Set(['none', 'email', 'captcha']);
/** 邀请码模式 */
export const INVITE_MODES = new Set(['none', 'optional', 'required']);

const SITE_DEFAULTS = {
  title: '壁纸集',
  description: '开源在线壁纸分享站，收录高清桌面与手机壁纸。',
  footer: '',
  icp: '',
  icpUrl: 'https://beian.miit.gov.cn/',
  // 开启后，所有壁纸都必须登录后才能下载（游客会被拦截并引导登录）
  requireLoginDownload: false,
  // 是否开放用户自助注册
  registrationEnabled: true,
  // 注册验证码模式：none 无需 / email 邮箱验证码 / captcha 图形验证码
  registerCodeMode: 'none',
  // 邀请码模式：none 无需 / optional 选填 / required 强制
  inviteMode: 'none',
  // 游客下载是否需要图形验证码（关闭「登录后下载」时对游客生效）
  downloadCaptcha: false,
  // 游客每天可下载原图的次数上限，0 表示不限制
  guestDownloadLimit: 0,
};

export function getSiteConfig() {
  const cfg = readJson('site', SITE_DEFAULTS);
  return {
    ...cfg,
    requireLoginDownload: bool(cfg.requireLoginDownload, false),
    registrationEnabled: bool(cfg.registrationEnabled, true),
    registerCodeMode: REGISTER_CODE_MODES.has(cfg.registerCodeMode) ? cfg.registerCodeMode : 'none',
    inviteMode: INVITE_MODES.has(cfg.inviteMode) ? cfg.inviteMode : 'none',
    downloadCaptcha: bool(cfg.downloadCaptcha, false),
    guestDownloadLimit: clampNumber(cfg.guestDownloadLimit, 0, 100000, 0),
  };
}

export function setSiteConfig(patch) {
  const current = getSiteConfig();
  const next = {
    title: str(patch.title, current.title),
    description: str(patch.description, current.description),
    footer: str(patch.footer, current.footer),
    icp: str(patch.icp, current.icp),
    icpUrl: str(patch.icpUrl, current.icpUrl),
    requireLoginDownload: bool(patch.requireLoginDownload, current.requireLoginDownload),
    registrationEnabled: bool(patch.registrationEnabled, current.registrationEnabled),
    registerCodeMode: oneOf(patch.registerCodeMode, current.registerCodeMode, REGISTER_CODE_MODES),
    inviteMode: oneOf(patch.inviteMode, current.inviteMode, INVITE_MODES),
    downloadCaptcha: bool(patch.downloadCaptcha, current.downloadCaptcha),
    guestDownloadLimit: clampNumber(patch.guestDownloadLimit, 0, 100000, current.guestDownloadLimit),
  };
  writeJson('site', next);
  return next;
}

/**
 * 是否允许拿到原图地址。
 * 「站点开启登录后下载」优先级最高：开启后未登录游客一律只给压缩预览图，
 * 即便后台把「游客」用户组的下载权限打开也不生效。
 */
export function canAccessOriginal(authUser, permissions) {
  if (getSiteConfig().requireLoginDownload && !authUser) return false;
  return Boolean(permissions?.download);
}

/* ================================ 外观设置 ================================ */
// Banner 背景图的三种布局方式：
//   cover   铺满——固定高度，图片等比放大铺满整宽，上下裁切（默认，即「横着铺满」）
//   stretch 拉伸——固定高度，强制拉伸填满，图片会变形
//   adapt   自适应——容器高度跟着图片比例走，整张图完整显示
export const BANNER_MODES = ['cover', 'stretch', 'adapt'];

/** 页脚默认栏目：与前台展示一致，可在后台「外观管理」中改写 */
const DEFAULT_FOOTER_COLUMNS = [
  {
    title: '浏览',
    items: [
      { label: '全部壁纸', to: '/wallpapers' },
      { label: '横向壁纸', to: '/wallpapers?orientation=landscape' },
      { label: '竖向壁纸', to: '/wallpapers?orientation=portrait' },
      { label: '热门下载', to: '/wallpapers?sort=downloads' },
    ],
    notes: [],
  },
  {
    title: '我的',
    items: [
      { label: '个人主页', to: '/user/@me', authOnly: true },
      { label: '我的收藏', to: '/favorites', authOnly: true },
      { label: '上传壁纸', to: '/upload', authOnly: true },
      { label: '个人设置', to: '/settings', authOnly: true },
      { label: '登录', to: '/login', guestOnly: true },
      { label: '注册账号', to: '/register', guestOnly: true },
      { label: '全部壁纸', to: '/wallpapers', guestOnly: true },
    ],
    notes: [],
  },
  {
    title: '关于',
    items: [{ label: '管理后台', to: '/admin', adminOnly: true }],
    notes: ['壁纸均来自网络收集', '仅供个人学习与欣赏'],
  },
];

const APPEARANCE_DEFAULTS = {
  banner: {
    enabled: true,
    mode: 'cover',
    image: '',
    title: '',
    subtitle: '',
    height: 320,
    overlay: 55,
    showSearch: true,
    showHotTags: true,
  },
  footer: {
    promoTitle: '',
    promoText: '',
    columns: DEFAULT_FOOTER_COLUMNS,
  },
  // 站点 Logo（导航栏左侧图标）：留空则前台只显示站点标题，不显示默认图标
  logo: '',
};

const BANNER_MODES_SET = new Set(BANNER_MODES);

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 枚举取值：不在允许集合里就回退到当前值 */
function oneOf(value, fallback, allowed) {
  return allowed.has(value) ? value : fallback;
}

/** 页脚栏目：过滤掉没有标题/没有内容的空行，避免前台出现空栏目 */
function normalizeFooterColumns(input) {
  const list = Array.isArray(input) ? input : DEFAULT_FOOTER_COLUMNS;
  return list
    .map((column) => {
      const items = (Array.isArray(column?.items) ? column.items : [])
        .map((item) => ({
          label: String(item?.label ?? '').trim(),
          to: String(item?.to ?? '').trim(),
          authOnly: item?.authOnly === true,
          guestOnly: item?.guestOnly === true,
          adminOnly: item?.adminOnly === true,
        }))
        .filter((item) => item.label && item.to);
      const notes = (Array.isArray(column?.notes) ? column.notes : [])
        .map((note) => String(note ?? '').trim())
        .filter(Boolean);
      return { title: String(column?.title ?? '').trim(), items, notes };
    })
    .filter((column) => column.title && (column.items.length > 0 || column.notes.length > 0));
}

function normalizeAppearance(raw = {}) {
  const bannerRaw = { ...APPEARANCE_DEFAULTS.banner, ...(raw.banner || {}) };
  const footerRaw = raw.footer || {};

  return {
    banner: {
      enabled: bool(bannerRaw.enabled, true),
      // 旧值 contain（固定高度 + 留黑边）已废弃，统一按「铺满」处理
      mode:
        bannerRaw.mode === 'contain' || !BANNER_MODES_SET.has(bannerRaw.mode) ? 'cover' : bannerRaw.mode,
      image: str(bannerRaw.image, ''),
      title: str(bannerRaw.title, ''),
      subtitle: str(bannerRaw.subtitle, ''),
      height: clampNumber(bannerRaw.height, 160, 720, APPEARANCE_DEFAULTS.banner.height),
      overlay: clampNumber(bannerRaw.overlay, 0, 95, APPEARANCE_DEFAULTS.banner.overlay),
      showSearch: bool(bannerRaw.showSearch, true),
      showHotTags: bool(bannerRaw.showHotTags, true),
    },
    footer: {
      promoTitle: str(footerRaw.promoTitle, ''),
      promoText: str(footerRaw.promoText, ''),
      columns: normalizeFooterColumns(footerRaw.columns),
    },
    logo: str(raw.logo, ''),
  };
}

export function getAppearanceConfig() {
  return normalizeAppearance(readJson('appearance', APPEARANCE_DEFAULTS));
}

export function setAppearanceConfig(patch = {}) {
  const current = getAppearanceConfig();
  const next = normalizeAppearance({
    banner: { ...current.banner, ...(patch.banner || {}) },
    footer: { ...current.footer, ...(patch.footer || {}) },
    logo: patch.logo != null ? patch.logo : current.logo,
  });
  writeJson('appearance', next);
  return next;
}

/** 供后台「恢复默认」使用 */
export function resetFooterColumns() {
  return structuredClone(DEFAULT_FOOTER_COLUMNS);
}

/* ================================ 评论设置 ================================ */
// 表情包本身在「表情包」管理页维护（可建多套、自己上传），这里只放开关
const COMMENT_DEFAULTS = {
  // 全局评论区开关：关闭后仅管理员可查看 / 发表评论
  enabled: true,
  // 是否开启表情包发送
  stickerEnabled: false,
};

export function getCommentConfig() {
  const cfg = readJson('comment', COMMENT_DEFAULTS);
  return {
    enabled: bool(cfg.enabled, COMMENT_DEFAULTS.enabled),
    stickerEnabled: bool(cfg.stickerEnabled, false),
  };
}

export function setCommentConfig(patch = {}) {
  const current = getCommentConfig();
  const next = {
    enabled: bool(patch.enabled, current.enabled),
    stickerEnabled: bool(patch.stickerEnabled, current.stickerEnabled),
  };
  writeJson('comment', next);
  return next;
}

/* ================================ 搜索设置 ================================ */
// 后台维护的热门搜索词：搜索框聚焦时无输入即展示这些词
const SEARCH_DEFAULTS = {
  hotWords: ['4K', '风景', '动漫', '手机壁纸', '极简'],
};

export function getSearchConfig() {
  const cfg = readJson('search', SEARCH_DEFAULTS);
  return {
    hotWords: (Array.isArray(cfg.hotWords) ? cfg.hotWords : [])
      .map((word) => String(word ?? '').trim())
      .filter(Boolean)
      .slice(0, 20),
  };
}

export function setSearchConfig(patch = {}) {
  const current = getSearchConfig();
  const source = patch.hotWords === undefined ? current.hotWords : patch.hotWords;
  const hotWords = (Array.isArray(source) ? source : [])
    .map((word) => String(word ?? '').trim())
    .filter(Boolean)
    .slice(0, 20);
  const next = { hotWords };
  writeJson('search', next);
  return next;
}

const STORAGE_DEFAULTS = {
  driver: config.defaults.storageDriver,
  strategy: config.defaults.storageStrategy,
  local: {
    dir: config.local.dir,
    publicUrl: config.local.publicUrl,
  },
};

const DRIVERS = new Set(['local', 's3', 'r2']);
const STRATEGIES = new Set(['round_robin', 'random', 'least_used']);

export function getStorageConfig() {
  const cfg = readJson('storage', STORAGE_DEFAULTS);
  if (!DRIVERS.has(cfg.driver)) cfg.driver = 'local';
  if (!STRATEGIES.has(cfg.strategy)) cfg.strategy = 'round_robin';
  cfg.local = { ...STORAGE_DEFAULTS.local, ...(cfg.local || {}) };
  return cfg;
}

export function setStorageConfig(patch = {}) {
  const current = getStorageConfig();
  const next = {
    driver: DRIVERS.has(patch.driver) ? patch.driver : current.driver,
    strategy: STRATEGIES.has(patch.strategy) ? patch.strategy : current.strategy,
    local: {
      dir: str(patch.local?.dir, current.local.dir),
      publicUrl: str(patch.local?.publicUrl, current.local.publicUrl),
    },
  };
  writeJson('storage', next);
  return next;
}

function str(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const v = String(value).trim();
  return v === '' && fallback !== undefined ? fallback : v;
}

/* ================================ 邮箱设置（SMTP） ================================ */
// 用于发送注册邮箱验证码；配置保存后，「注册验证码模式」选「邮箱验证码」才真正生效
const EMAIL_DEFAULTS = {
  host: '',
  port: 465,
  secure: true,
  user: '',
  pass: '',
  fromName: '',
  fromEmail: '',
};

export function getEmailConfig() {
  const cfg = readJson('email', EMAIL_DEFAULTS);
  return {
    host: String(cfg.host ?? '').trim(),
    port: clampNumber(cfg.port, 1, 65535, 465),
    secure: bool(cfg.secure, true),
    user: String(cfg.user ?? '').trim(),
    pass: String(cfg.pass ?? ''),
    fromName: String(cfg.fromName ?? '').trim(),
    fromEmail: String(cfg.fromEmail ?? '').trim(),
  };
}

export function setEmailConfig(patch = {}) {
  const current = getEmailConfig();
  const next = {
    host: String(patch.host ?? current.host).trim(),
    port: clampNumber(patch.port, 1, 65535, current.port),
    secure: bool(patch.secure, current.secure),
    user: String(patch.user ?? current.user).trim(),
    pass: String(patch.pass ?? current.pass),
    fromName: String(patch.fromName ?? current.fromName).trim(),
    fromEmail: String(patch.fromEmail ?? current.fromEmail).trim(),
  };
  writeJson('email', next);
  return next;
}

/** 是否已配置好可用的 SMTP（至少需要服务器地址 + 账号） */
export function isEmailConfigured() {
  const cfg = getEmailConfig();
  return Boolean(cfg.host && cfg.user);
}
