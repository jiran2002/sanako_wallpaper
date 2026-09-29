import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/**
 * node:sqlite 不接受 undefined / boolean 作为绑定参数，这里统一归一化。
 */
function normalize(params) {
  return (params || []).map((v) => {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof Date) return v.toISOString();
    return v;
  });
}

/** 查询多行 */
export function all(sql, params) {
  return db.prepare(sql).all(...normalize(params));
}

/** 查询单行 */
export function get(sql, params) {
  return db.prepare(sql).get(...normalize(params)) ?? null;
}

/** 执行写入，返回 { changes, lastInsertRowid } */
export function run(sql, params) {
  const res = db.prepare(sql).run(...normalize(params));
  return {
    changes: Number(res.changes),
    lastInsertRowid: Number(res.lastInsertRowid),
  };
}

/** 查询单个标量值 */
export function scalar(sql, params) {
  const row = get(sql, params);
  if (!row) return null;
  return Object.values(row)[0] ?? null;
}

/** 在事务中执行 */
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
