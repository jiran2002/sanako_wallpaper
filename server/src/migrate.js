import { all, db, get, run } from './db.js';
import { config } from './config.js';
import { nowStr } from './lib/utils.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',
  nickname      TEXT NOT NULL DEFAULT '',
  bio           TEXT NOT NULL DEFAULT '',
  avatar        TEXT NOT NULL DEFAULT '',
  status        INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL,
  image_id   INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, image_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id, created_at DESC);

-- 用户合集（收藏夹分组）：favorites.collection_id 为空表示「未分组」默认收藏
CREATE TABLE IF NOT EXISTS collections (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id);

CREATE TABLE IF NOT EXISTS invite_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE,
  max_uses   INTEGER NOT NULL DEFAULT 1,   -- 0 表示不限次数
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL DEFAULT '',     -- '' 表示不过期
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);

CREATE TABLE IF NOT EXISTS categories (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  description  TEXT NOT NULL DEFAULT '',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  -- 上级分类：NULL 表示一级分类，否则为二级分类（最多两级）
  parent_id    INTEGER,
  -- 是否置顶到顶部导航栏
  show_in_nav  INTEGER NOT NULL DEFAULT 0,
  -- 是否在首页生成分区
  show_on_home INTEGER NOT NULL DEFAULT 0,
  -- 展示样式：pc 宽高自适应（默认）/ mobile 竖图适配；二级分类跟随其一级分类
  display_style TEXT NOT NULL DEFAULT 'pc',
  -- 是否加入「全部壁纸」：为 0 时该分类（及其下二级分类）的图片不会出现在 /wallpapers 聚合列表
  show_in_all  INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS storage_accounts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  provider          TEXT NOT NULL DEFAULT 'r2',
  account_id        TEXT NOT NULL DEFAULT '',
  endpoint          TEXT NOT NULL DEFAULT '',
  region            TEXT NOT NULL DEFAULT 'auto',
  access_key_id     TEXT NOT NULL,
  secret_access_key TEXT NOT NULL,
  bucket            TEXT NOT NULL,
  public_url        TEXT NOT NULL DEFAULT '',
  force_path_style  INTEGER NOT NULL DEFAULT 0,
  enabled           INTEGER NOT NULL DEFAULT 1,
  weight            INTEGER NOT NULL DEFAULT 1,
  used_count        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  title              TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  filename           TEXT NOT NULL,
  storage_key        TEXT NOT NULL,
  thumb_key          TEXT,
  storage_account_id INTEGER,
  user_id            INTEGER,
  url                TEXT NOT NULL DEFAULT '',
  width              INTEGER NOT NULL DEFAULT 0,
  height             INTEGER NOT NULL DEFAULT 0,
  size               INTEGER NOT NULL DEFAULT 0,
  format             TEXT NOT NULL DEFAULT '',
  category_id        INTEGER,
  downloads          INTEGER NOT NULL DEFAULT 0,
  views              INTEGER NOT NULL DEFAULT 0,
  -- 0 已隐藏 / 1 已发布 / 2 待审核 / 3 已驳回
  status             INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_images_category ON images(category_id);
CREATE INDEX IF NOT EXISTS idx_images_status_created ON images(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_views ON images(views DESC);
CREATE INDEX IF NOT EXISTS idx_images_downloads ON images(downloads DESC);

CREATE TABLE IF NOT EXISTS image_tags (
  image_id INTEGER NOT NULL,
  tag_id   INTEGER NOT NULL,
  PRIMARY KEY (image_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_image_tags_tag ON image_tags(tag_id);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 图包：一次上传多张壁纸时，用 packs 分配一个分组 id，images.pack_id 指向它
CREATE TABLE IF NOT EXISTS packs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 壁纸评论：支持两级（楼中楼）。parent_id 指向顶级评论，reply_to_id 记录具体回复的那条
CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  image_id    INTEGER NOT NULL,
  user_id     INTEGER,
  parent_id   INTEGER,
  reply_to_id INTEGER,
  content     TEXT NOT NULL DEFAULT '',
  -- 表情包：指向 stickers.id，读取时解析出图片地址
  sticker_id  INTEGER,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_image ON comments(image_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);

-- 表情包套装：后台可创建多套，每套有名字与 icon 图
CREATE TABLE IF NOT EXISTS sticker_packs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  -- icon 图（本机 uploads/stickers/ 下的相对 key），留空时前台取该套第一张表情
  icon_key   TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 表情包：属于某一套，文件存本机 uploads/stickers/ 下
CREATE TABLE IF NOT EXISTS stickers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_id     INTEGER NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  storage_key TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stickers_pack ON stickers(pack_id, sort_order ASC, id ASC);

-- 后台维护任务（定时 / 手动）的执行记录
CREATE TABLE IF NOT EXISTS task_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task        TEXT NOT NULL,
  -- manual 手动触发 / schedule 定时触发
  trigger     TEXT NOT NULL DEFAULT 'manual',
  -- running 执行中 / success 成功 / failed 失败
  status      TEXT NOT NULL DEFAULT 'running',
  detail      TEXT NOT NULL DEFAULT '',
  started_at  TEXT NOT NULL,
  finished_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_task_runs_task ON task_runs(task, id DESC);

-- 后台写操作日志：谁在什么时候改了什么
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER,
  actor_name  TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id   TEXT NOT NULL DEFAULT '',
  detail      TEXT NOT NULL DEFAULT '',
  ip          TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- 搜索词统计：同一关键词累加次数，后台据此挑选热门搜索词
CREATE TABLE IF NOT EXISTS search_terms (
  keyword          TEXT PRIMARY KEY,
  count            INTEGER NOT NULL DEFAULT 0,
  -- 最近一次搜索命中的壁纸数，为 0 说明用户搜不到东西
  results          INTEGER NOT NULL DEFAULT 0,
  last_searched_at TEXT NOT NULL
);

-- 按天累计下载/浏览，供后台近 30 天趋势图使用（注册数直接用 users.created_at 统计）
CREATE TABLE IF NOT EXISTS daily_stats (
  date      TEXT PRIMARY KEY,
  downloads INTEGER NOT NULL DEFAULT 0,
  views     INTEGER NOT NULL DEFAULT 0
);

-- 壁纸举报：前台详情页提交，后台审核处理（status 0 待处理 / 1 已下架 / 2 已忽略）
CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  image_id   INTEGER NOT NULL,
  user_id    INTEGER,
  reason     TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '',
  status     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
`;

const DEFAULT_SETTINGS = {
  site: {
    title: '壁纸集',
    description: '开源在线壁纸分享站，收录高清桌面与手机壁纸。',
    footer: '',
    icp: '',
    icpUrl: 'https://beian.miit.gov.cn/',
  },
  storage: {
    driver: config.defaults.storageDriver,
    strategy: config.defaults.storageStrategy,
    local: {
      dir: config.local.dir,
      publicUrl: config.local.publicUrl,
    },
  },
};

/** 老库补列：SQLite 不支持 ADD COLUMN IF NOT EXISTS，先查表结构 */
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/**
 * 早期版本后台账号存在独立的 admins 表，现已合并进 users 表（role = admin）。
 * 迁移完成后删除旧表，避免两套账号体系并存。
 */
function migrateLegacyAdmins() {
  const exists = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'admins'")
    .get();
  if (!exists) return;

  for (const admin of all('SELECT username, password_hash, created_at FROM admins')) {
    if (get('SELECT id FROM users WHERE username = ?', [admin.username])) continue;
    run(
      `INSERT INTO users (username, password_hash, role, nickname, bio, avatar, created_at, updated_at)
       VALUES (?, ?, 'admin', ?, '', '', ?, ?)`,
      [admin.username, admin.password_hash, admin.username, admin.created_at, admin.created_at],
    );
  }
  db.exec('DROP TABLE admins');
}

export function migrate() {
  db.exec(SCHEMA);

  // images.user_id 是后加的列，老库需要补上
  ensureColumn('images', 'user_id', 'INTEGER');
  db.exec('CREATE INDEX IF NOT EXISTS idx_images_user ON images(user_id)');

  // 用户组（角色）与账号状态是后加的能力，老库需要补列
  ensureColumn('users', 'status', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('users', 'last_login_at', "TEXT NOT NULL DEFAULT ''");
  // 邮箱验证码 / 注册流程是后加的能力，老库需要补邮箱列
  ensureColumn('users', 'email', "TEXT NOT NULL DEFAULT ''");
  // 旧版本的 user 角色统一并入「会员」组
  run("UPDATE users SET role = 'member' WHERE role = 'user'");

  // 分类的层级与展示开关是后加的能力，老库需要补列
  ensureColumn('categories', 'parent_id', 'INTEGER');
  ensureColumn('categories', 'show_in_nav', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('categories', 'show_on_home', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('categories', 'display_style', "TEXT NOT NULL DEFAULT 'pc'");
  ensureColumn('categories', 'show_in_all', 'INTEGER NOT NULL DEFAULT 1');
  db.exec('CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id)');

  // 视频壁纸 / 图包 / 网盘下载是后加的能力，老库需要补列
  ensureColumn('images', 'kind', "TEXT NOT NULL DEFAULT 'image'");
  ensureColumn('images', 'pack_id', 'INTEGER');
  ensureColumn('images', 'pack_sort', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('images', 'pack_cover', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('images', 'mirrors', "TEXT NOT NULL DEFAULT '[]'");
  db.exec('CREATE INDEX IF NOT EXISTS idx_images_pack ON images(pack_id)');

  // 按主色筛选 / 上传查重是后加的能力，老库需要补列
  ensureColumn('images', 'dominant_color', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('images', 'color_bucket', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('images', 'phash', "TEXT NOT NULL DEFAULT ''");
  db.exec('CREATE INDEX IF NOT EXISTS idx_images_color ON images(color_bucket)');

  // 多尺寸预览图（srcset）是后加的能力，存 [{ width, key }]，老库需要补列
  ensureColumn('images', 'variants', "TEXT NOT NULL DEFAULT '[]'");

  // 回收站（软删除）是后加的能力：删除只标记 deleted_at，空串表示未删除
  ensureColumn('images', 'deleted_at', "TEXT NOT NULL DEFAULT ''");
  db.exec('CREATE INDEX IF NOT EXISTS idx_images_deleted ON images(deleted_at)');

  // 审核驳回原因：驳回时必填，创作者中心展示给投稿人
  ensureColumn('images', 'reject_reason', "TEXT NOT NULL DEFAULT ''");

  // 收藏夹分组（合集）是后加的能力：favorites 补一列，为空表示未分组
  ensureColumn('favorites', 'collection_id', 'INTEGER');
  db.exec('CREATE INDEX IF NOT EXISTS idx_favorites_collection ON favorites(collection_id)');

  migrateFullTextSearch();
  migrateLegacyAdmins();

  const now = nowStr();
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    run('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [
      key,
      JSON.stringify(value),
      now,
    ]);
  }

  upgradeCategoriesToTwoLevels(now);
  migrateCommentStickers(now);
}

/** 全文搜索的一次性迁移标记 */
const FTS_MIGRATION_KEY = 'migration.images_fts';

/**
 * 全文搜索用 FTS5 + trigram 分词器：中文没有空格，trigram 恰好按子串匹配，
 * 中英文都能命中「关键词出现在标题里」的场景。content='images' 是外部内容表，
 * 不额外存一份正文，靠触发器与 images 表保持同步，老数据用 rebuild 回填。
 * 注意检索至少要 3 个字符，更短的词由上层退回 LIKE。
 */
function migrateFullTextSearch() {
  if (get('SELECT key FROM settings WHERE key = ?', [FTS_MIGRATION_KEY])) return;

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS images_fts USING fts5(
      title, description, filename,
      content='images', content_rowid='id', tokenize='trigram'
    );

    CREATE TRIGGER IF NOT EXISTS images_fts_ai AFTER INSERT ON images BEGIN
      INSERT INTO images_fts(rowid, title, description, filename)
      VALUES (new.id, new.title, new.description, new.filename);
    END;

    CREATE TRIGGER IF NOT EXISTS images_fts_ad AFTER DELETE ON images BEGIN
      INSERT INTO images_fts(images_fts, rowid, title, description, filename)
      VALUES ('delete', old.id, old.title, old.description, old.filename);
    END;

    CREATE TRIGGER IF NOT EXISTS images_fts_au AFTER UPDATE OF title, description, filename ON images BEGIN
      INSERT INTO images_fts(images_fts, rowid, title, description, filename)
      VALUES ('delete', old.id, old.title, old.description, old.filename);
      INSERT INTO images_fts(rowid, title, description, filename)
      VALUES (new.id, new.title, new.description, new.filename);
    END;

    INSERT INTO images_fts(images_fts) VALUES ('rebuild');
  `);

  run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [
    FTS_MIGRATION_KEY,
    JSON.stringify(true),
    nowStr(),
  ]);
}

/** 表情包改为「后台上传」后的一次性迁移标记 */
const COMMENT_STICKER_MIGRATION_KEY = 'migration.comments_sticker_uploads';

/**
 * 表情包最初是「引用某个分类下的壁纸」，现在改为独立上传，
 * comments.sticker_id 的含义从 images.id 变成 stickers.id。
 * 旧值在新表里可能撞上无关的表情包，故一次性清空（功能刚上线，历史数据可弃）。
 */
function migrateCommentStickers(now) {
  if (get('SELECT key FROM settings WHERE key = ?', [COMMENT_STICKER_MIGRATION_KEY])) return;
  run('UPDATE comments SET sticker_id = NULL WHERE sticker_id IS NOT NULL');
  run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [
    COMMENT_STICKER_MIGRATION_KEY,
    JSON.stringify(true),
    now,
  ]);
}

/** 分类升级为两级结构时的一次性迁移标记 */
const CATEGORY_TREE_MIGRATION_KEY = 'migration.categories_tree';

/**
 * 升级到「一级 / 二级分类」后，老库里的分类都是一级分类，
 * 默认让它们继续出现在顶部导航栏，避免升级后导航栏变空。
 * 只执行一次，之后后台里手动关掉的开关不会被重新打开。
 */
function upgradeCategoriesToTwoLevels(now) {
  if (get('SELECT key FROM settings WHERE key = ?', [CATEGORY_TREE_MIGRATION_KEY])) return;
  run('UPDATE categories SET show_in_nav = 1 WHERE parent_id IS NULL');
  run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [
    CATEGORY_TREE_MIGRATION_KEY,
    JSON.stringify(true),
    now,
  ]);
}

/** 首次启动时写入的默认分类（一级分类，默认展示在顶部导航栏） */
const DEFAULT_CATEGORIES = ['风景', '动漫', '游戏', '动物', '极简', '抽象'];

export function seedDefaults() {
  const count = Number(
    db.prepare('SELECT COUNT(*) AS n FROM categories').get()?.n ?? 0,
  );
  if (count > 0) return;
  const now = nowStr();
  DEFAULT_CATEGORIES.forEach((name, i) => {
    run(
      `INSERT OR IGNORE INTO categories (name, slug, description, sort_order, show_in_nav, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [name, `cat-${i + 1}`, '', i, now, now],
    );
  });
}
