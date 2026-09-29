import { all, get, run } from '../../db.js';
import { config } from '../../config.js';
import { HttpError } from '../../lib/http.js';
import { nowStr } from '../../lib/utils.js';
import { getStorageConfig } from '../settings.js';
import { createLocalStorage } from './local.js';
import { createRemoteStorage, buildEndpoint, createS3Client } from './remote.js';

const ACCOUNT_COLUMNS = `
  id, name, provider, account_id, endpoint, region, access_key_id, secret_access_key,
  bucket, public_url, force_path_style, enabled, weight, used_count, created_at, updated_at
`;

function toAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    accountId: row.account_id,
    endpoint: row.endpoint,
    region: row.region,
    accessKeyId: row.access_key_id,
    secretAccessKey: row.secret_access_key,
    bucket: row.bucket,
    publicUrl: row.public_url,
    forcePathStyle: row.force_path_style,
    enabled: row.enabled,
    weight: row.weight || 1,
    usedCount: row.used_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* ---------------------------------- 账号 CRUD ---------------------------------- */

export function listAccounts({ onlyEnabled = false, provider } = {}) {
  const where = [];
  const params = [];
  if (onlyEnabled) where.push('enabled = 1');
  if (provider) {
    where.push('provider = ?');
    params.push(provider);
  }
  const sql = `SELECT ${ACCOUNT_COLUMNS} FROM storage_accounts
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id ASC`;
  return all(sql, params).map(toAccount);
}

export function getAccount(id) {
  return toAccount(get(`SELECT ${ACCOUNT_COLUMNS} FROM storage_accounts WHERE id = ?`, [id]));
}

/** id -> account，供批量解析图片地址使用 */
export function accountsMap() {
  const map = new Map();
  for (const acc of listAccounts()) map.set(acc.id, acc);
  return map;
}

/**
 * S3 模式只使用一套上传配置，固定取第一条 provider = 's3' 的账号。
 */
export function getSingleS3Account() {
  return listAccounts({ provider: 's3' })[0] || null;
}

/** 保存 S3 单套配置：已有则更新，没有则新建 */
export function saveSingleS3Account(input) {
  const current = getSingleS3Account();
  const payload = {
    name: String(input.name || '').trim() || 'S3 存储',
    provider: 's3',
    endpoint: input.endpoint,
    region: input.region,
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
    bucket: input.bucket,
    publicUrl: input.publicUrl,
    forcePathStyle: input.forcePathStyle,
    enabled: true,
    weight: 1,
  };
  return current ? updateAccount(current.id, payload) : createAccount(payload);
}

export function createAccount(input) {
  const now = nowStr();
  const provider = input.provider === 's3' ? 's3' : 'r2';
  const { lastInsertRowid } = run(
    `INSERT INTO storage_accounts
      (name, provider, account_id, endpoint, region, access_key_id, secret_access_key,
       bucket, public_url, force_path_style, enabled, weight, used_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      input.name,
      provider,
      input.accountId || '',
      input.endpoint || '',
      input.region || (provider === 'r2' ? 'auto' : 'us-east-1'),
      input.accessKeyId,
      input.secretAccessKey,
      input.bucket,
      input.publicUrl || '',
      input.forcePathStyle ? 1 : 0,
      input.enabled === false ? 0 : 1,
      Number(input.weight) > 0 ? Number(input.weight) : 1,
      now,
      now,
    ],
  );
  return getAccount(lastInsertRowid);
}

export function updateAccount(id, input) {
  const current = getAccount(id);
  if (!current) throw new HttpError(404, '存储账号不存在');

  const next = {
    name: input.name ?? current.name,
    provider: input.provider ? (input.provider === 's3' ? 's3' : 'r2') : current.provider,
    accountId: input.accountId ?? current.accountId,
    endpoint: input.endpoint ?? current.endpoint,
    region: input.region ?? current.region,
    accessKeyId: input.accessKeyId ?? current.accessKeyId,
    // 留空表示不修改密钥
    secretAccessKey:
      input.secretAccessKey && !String(input.secretAccessKey).includes('****')
        ? input.secretAccessKey
        : current.secretAccessKey,
    bucket: input.bucket ?? current.bucket,
    publicUrl: input.publicUrl ?? current.publicUrl,
    forcePathStyle:
      input.forcePathStyle === undefined ? current.forcePathStyle : input.forcePathStyle ? 1 : 0,
    enabled: input.enabled === undefined ? current.enabled : input.enabled ? 1 : 0,
    weight: Number(input.weight) > 0 ? Number(input.weight) : current.weight,
  };

  run(
    `UPDATE storage_accounts SET
       name = ?, provider = ?, account_id = ?, endpoint = ?, region = ?,
       access_key_id = ?, secret_access_key = ?, bucket = ?, public_url = ?,
       force_path_style = ?, enabled = ?, weight = ?, updated_at = ?
     WHERE id = ?`,
    [
      next.name,
      next.provider,
      next.accountId,
      next.endpoint,
      next.region,
      next.accessKeyId,
      next.secretAccessKey,
      next.bucket,
      next.publicUrl,
      next.forcePathStyle,
      next.enabled,
      next.weight,
      nowStr(),
      id,
    ],
  );
  return getAccount(id);
}

export function deleteAccount(id) {
  const used = Number(
    get('SELECT COUNT(*) AS n FROM images WHERE storage_account_id = ?', [id])?.n ?? 0,
  );
  if (used > 0) {
    throw new HttpError(400, `该账号下还有 ${used} 张壁纸，请先迁移或删除后再试`);
  }
  run('DELETE FROM storage_accounts WHERE id = ?', [id]);
}

export function bumpUsage(accountId) {
  if (!accountId) return;
  run('UPDATE storage_accounts SET used_count = used_count + 1 WHERE id = ?', [accountId]);
}

/* ---------------------------------- 分配策略 ---------------------------------- */

function weightedRandom(accounts) {
  const total = accounts.reduce((sum, a) => sum + Math.max(1, a.weight || 1), 0);
  let r = Math.random() * total;
  for (const acc of accounts) {
    r -= Math.max(1, acc.weight || 1);
    if (r <= 0) return acc;
  }
  return accounts[accounts.length - 1];
}

/**
 * 账号池：按策略挑选账号，并支持失败自动切换。
 */
function createPoolStorage(accounts, strategy) {
  const adapters = new Map(accounts.map((a) => [a.id, createRemoteStorage(a)]));
  let cursor = 0;

  function pick() {
    if (accounts.length === 1) return accounts[0];
    if (strategy === 'random') return weightedRandom(accounts);
    if (strategy === 'least_used') {
      return [...accounts].sort(
        (a, b) => (a.usedCount || 0) - (b.usedCount || 0) || a.id - b.id,
      )[0];
    }
    // 加权轮询
    const ring = [];
    for (const acc of accounts) {
      for (let i = 0; i < Math.max(1, acc.weight || 1); i += 1) ring.push(acc);
    }
    const chosen = ring[cursor % ring.length];
    cursor = (cursor + 1) % ring.length;
    return chosen;
  }

  /** 首选账号排在最前，其余作为故障转移备份 */
  function candidates() {
    const first = pick();
    return [first, ...accounts.filter((a) => a.id !== first.id)];
  }

  return {
    kind: 'remote',
    accounts,

    /**
     * 上传对象。options.accountId 传入时固定写该账号，不做故障转移：
     * 缩略图必须与原图落在同一个账号/桶，否则地址会按原图账号解析导致 404。
     */
    async put(key, buffer, contentType, options = {}) {
      if (options?.accountId) {
        const pinned = accounts.find((a) => a.id === Number(options.accountId));
        if (!pinned) throw new HttpError(400, '原图所在的存储账号已不可用，无法上传缩略图');
        const res = await adapters.get(pinned.id).put(key, buffer, contentType);
        bumpUsage(pinned.id);
        pinned.usedCount = (pinned.usedCount || 0) + 1;
        return { ...res, accountName: pinned.name };
      }

      const errors = [];
      for (const acc of candidates()) {
        try {
          const res = await adapters.get(acc.id).put(key, buffer, contentType);
          bumpUsage(acc.id);
          acc.usedCount = (acc.usedCount || 0) + 1;
          return { ...res, accountName: acc.name };
        } catch (err) {
          errors.push(`${acc.name}: ${err.message}`);
        }
      }
      throw new HttpError(502, `所有存储账号均上传失败 —— ${errors.join('；')}`);
    },

    async remove(key, accountId) {
      const adapter = adapters.get(accountId) || adapters.get(accounts[0].id);
      if (!adapter) throw new HttpError(400, '找不到对象所在的存储账号');
      await adapter.remove(key);
    },

    async get(key, accountId) {
      const adapter = adapters.get(accountId) || adapters.get(accounts[0].id);
      if (!adapter) throw new HttpError(400, '找不到对象所在的存储账号');
      return adapter.get(key);
    },

    async test() {
      const results = [];
      for (const acc of accounts) {
        const res = await adapters.get(acc.id).test();
        results.push(`${acc.name}: ${res.ok ? '正常' : '失败'}（${res.message}）`);
      }
      return { ok: results.every((r) => r.includes('正常')), message: results.join('\n') };
    },
  };
}

/* ---------------------------------- 统一出口 ---------------------------------- */

/**
 * 根据当前设置返回可用的存储适配器。
 * - local：本机磁盘
 * - s3：单套 S3 上传配置
 * - r2：按分配策略在多账号池中挑选
 * 注意：每次调用都会重新读取设置，便于后台切换后立即生效。
 */
export function getStorage() {
  const cfg = getStorageConfig();

  if (cfg.driver === 'local') {
    return { driver: 'local', strategy: 'local', storage: createLocalStorage(cfg.local), accounts: [] };
  }

  if (cfg.driver === 's3') {
    const account = getSingleS3Account();
    if (!account) {
      throw new HttpError(400, '当前选择了 S3 存储，但还没有完成 S3 上传设置，请先到「存储设置」中填写并保存');
    }
    if (!buildEndpoint(account)) {
      throw new HttpError(400, 'S3 上传设置缺少 Endpoint，请先到「存储设置」中补全');
    }
    return { driver: 's3', strategy: 'single', storage: createRemoteStorage(account), accounts: [account] };
  }

  const accounts = listAccounts({ onlyEnabled: true, provider: 'r2' });
  if (accounts.length === 0) {
    throw new HttpError(400, '当前选择了 Cloudflare R2，但账号池中没有启用的账号，请先在「存储设置」中添加');
  }
  return {
    driver: 'r2',
    strategy: cfg.strategy,
    storage: createPoolStorage(accounts, cfg.strategy),
    accounts,
  };
}

/** 供后台「测试连接」使用（可测未启用的账号） */
export function testAccount(account) {
  if (account.provider === 's3' || account.provider === 'r2') {
    if (!buildEndpoint(account)) {
      return Promise.resolve({ ok: false, message: '缺少 Endpoint 或 Account ID' });
    }
    return createRemoteStorage(account).test();
  }
  return Promise.resolve({ ok: false, message: '不支持的存储类型' });
}

export { createS3Client, createRemoteStorage };

/* ---------------------------------- 地址解析 ---------------------------------- */

function joinUrl(base, key) {
  const b = String(base || '').replace(/\/+$/, '');
  const k = String(key || '').replace(/^\/+/, '');
  return k ? `${b}/${k}` : b;
}

/** 对象存储的公开访问地址 */
export function buildRemotePublicUrl(account, key) {
  if (!account || !key) return '';
  const custom = String(account.publicUrl || '').trim().replace(/\/+$/, '');
  if (custom) return joinUrl(custom, key);

  const endpoint = buildEndpoint(account);
  if (!endpoint) return '';
  if (account.forcePathStyle) return joinUrl(`${endpoint}/${account.bucket}`, key);
  return joinUrl(endpoint.replace('://', `://${account.bucket}.`), key);
}

/**
 * 根据存储 key 解析可访问的图片地址。
 * - 有 storage_account_id：走对象存储（优先使用账号自定义的公开域名）
 * - 否则：走本机存储
 */
export function resolvePublicUrl(key, accountId, accounts, storageCfg) {
  if (!key) return '';
  if (accountId) {
    const account = accounts?.get?.(accountId) || accounts?.[accountId];
    if (account) return buildRemotePublicUrl(account, key);
  }
  const cfg = storageCfg || getStorageConfig();
  const base = String(cfg.local?.publicUrl || config.local.publicUrl);
  if (/^https?:\/\//i.test(base)) return joinUrl(base, key);
  return joinUrl(config.publicBaseUrl, joinUrl(base, key));
}
