import { all, get, run } from '../db.js';
import { nowStr } from '../lib/utils.js';

/** 检索短于该长度的关键词时 FTS5 的 trigram 索引无从匹配，退回 LIKE */
export const MIN_FTS_LENGTH = 3;

let ftsChecked = false;
let ftsReady = false;

/**
 * FTS5 是否可用。迁移在 bootstrap() 里执行，而本模块在启动时就被 import，
 * 故不能在模块顶层判断，改为首次调用时查一次 sqlite_master 并缓存。
 */
export function hasFullTextSearch() {
  if (!ftsChecked) {
    ftsReady = Boolean(
      get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'images_fts'"),
    );
    ftsChecked = true;
  }
  return ftsReady;
}

/**
 * 把用户输入转成 FTS5 的 phrase 查询：整体加双引号，内部双引号翻倍转义。
 * trigram 分词器下 phrase 查询等价于「子串包含」，中英文都适用，
 * 也不会被 AND / OR / NEAR 之类的查询关键字误伤。
 */
export function fullTextMatch(keyword) {
  return `"${String(keyword).replace(/"/g, '""')}"`;
}

/** 判断某个关键词是否该走全文索引 */
export function shouldUseFullText(keyword) {
  return String(keyword || '').trim().length >= MIN_FTS_LENGTH && hasFullTextSearch();
}

/** 记录一次搜索：同一关键词累加次数，后台据此挑热门搜索词 */
export function recordSearchTerm(keyword, results = 0) {
  const word = String(keyword || '').trim().slice(0, 60);
  if (!word) return;
  run(
    `INSERT INTO search_terms (keyword, count, results, last_searched_at) VALUES (?, 1, ?, ?)
     ON CONFLICT(keyword) DO UPDATE SET
       count = count + 1,
       results = excluded.results,
       last_searched_at = excluded.last_searched_at`,
    [word, Math.max(0, Number(results) || 0), nowStr()],
  );
}

/** 后台查看搜索词统计：按搜索次数倒序 */
export function listSearchTerms({ limit = 100 } = {}) {
  const size = Math.min(500, Math.max(1, Number(limit) || 100));
  return all(
    `SELECT keyword, count, results, last_searched_at
     FROM search_terms
     ORDER BY count DESC, last_searched_at DESC
     LIMIT ?`,
    [size],
  ).map((row) => ({
    keyword: row.keyword,
    count: row.count,
    results: row.results,
    lastSearchedAt: row.last_searched_at,
  }));
}