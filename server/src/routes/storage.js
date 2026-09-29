import { badRequest, notFound } from '../lib/http.js';
import { buildEndpoint } from '../services/storage/remote.js';
import {
  createAccount,
  deleteAccount,
  getAccount,
  getSingleS3Account,
  listAccounts,
  saveSingleS3Account,
  testAccount,
  updateAccount,
} from '../services/storage/index.js';
import { getStorageConfig, setStorageConfig } from '../services/settings.js';

/** 密钥打码：sk_live_abcd**** */
function maskSecret(secret) {
  const s = String(secret || '');
  if (s.length <= 4) return '****';
  return `${s.slice(0, 4)}****`;
}

/** 前端回传的密钥若仍是打码值，视为「不修改」 */
function isMasked(value) {
  return !value || String(value).includes('****');
}

function serializeAccount(account) {
  return {
    id: account.id,
    name: account.name,
    provider: account.provider,
    accountId: account.accountId,
    endpoint: buildEndpoint(account),
    endpointRaw: account.endpoint,
    region: account.region,
    accessKeyId: account.accessKeyId,
    secretAccessKey: maskSecret(account.secretAccessKey),
    bucket: account.bucket,
    publicUrl: account.publicUrl,
    forcePathStyle: account.forcePathStyle,
    enabled: account.enabled,
    weight: account.weight,
    usedCount: account.usedCount,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

/** S3 单套上传配置（不含账号池相关字段） */
function serializeS3(account) {
  if (!account) {
    return {
      configured: false,
      endpoint: '',
      region: 'us-east-1',
      accessKeyId: '',
      secretAccessKey: '',
      bucket: '',
      publicUrl: '',
      forcePathStyle: false,
    };
  }
  return {
    configured: true,
    endpoint: account.endpoint || '',
    region: account.region || 'us-east-1',
    accessKeyId: account.accessKeyId || '',
    secretAccessKey: maskSecret(account.secretAccessKey),
    bucket: account.bucket || '',
    publicUrl: account.publicUrl || '',
    forcePathStyle: Boolean(account.forcePathStyle),
    updatedAt: account.updatedAt,
  };
}

function validateAccountInput(body, { partial = false } = {}) {
  const required = ['name', 'accessKeyId', 'secretAccessKey', 'bucket'];
  if (!partial) {
    for (const field of required) {
      if (!String(body?.[field] ?? '').trim()) {
        throw badRequest(`存储账号缺少必填项：${field}`);
      }
    }
  }
  const provider = body?.provider;
  if (provider !== undefined && provider !== 'r2' && provider !== 's3') {
    throw badRequest('provider 只能是 r2 或 s3');
  }
}

/** S3 单套配置必填校验；首次保存必须带明文 Secret（已配置过则留空表示沿用原密钥） */
function validateS3Input(body, { requireSecret }) {
  const required = ['endpoint', 'accessKeyId', 'bucket'];
  for (const field of required) {
    if (!String(body?.[field] ?? '').trim()) {
      throw badRequest(`S3 上传设置缺少必填项：${field}`);
    }
  }
  if (requireSecret && isMasked(body?.secretAccessKey)) {
    throw badRequest('S3 上传设置缺少必填项：secretAccessKey');
  }
}

export default async function storageRoutes(app) {
  const guard = { onRequest: [app.requirePermission('manageSettings')] };

  /* ------------------------------- 存储驱动设置 ------------------------------- */
  app.get('/api/admin/storage/config', guard, async () => getStorageConfig());

  app.put('/api/admin/storage/config', guard, async (req) => {
    const body = req.body || {};
    const targetDriver = body.driver ?? getStorageConfig().driver;

    // 切到 S3 前必须已有一套完整的 S3 上传设置
    if (targetDriver === 's3') {
      const account = getSingleS3Account();
      if (!account || !account.accessKeyId || !account.bucket) {
        throw badRequest('请先在下方完成「S3 上传设置」并保存，再切换到 S3 存储');
      }
      if (!buildEndpoint(account)) {
        throw badRequest('S3 上传设置缺少 Endpoint，请补全后再切换');
      }
    }

    // 切到 R2 前账号池里至少要有一个启用的 R2 账号（分配策略才有的可分配）
    if (targetDriver === 'r2' && listAccounts({ onlyEnabled: true, provider: 'r2' }).length === 0) {
      throw badRequest('请先在下方添加并启用至少一个 Cloudflare R2 账号，再切换到 R2 存储');
    }

    return setStorageConfig(body);
  });

  /* ---------------------------- S3 单套上传设置 ---------------------------- */
  app.get('/api/admin/storage/s3', guard, async () => serializeS3(getSingleS3Account()));

  app.put('/api/admin/storage/s3', guard, async (req) => {
    const body = req.body || {};
    const current = getSingleS3Account();
    // 首次保存必须填 Secret；编辑时留空或传回打码值都表示沿用原密钥
    validateS3Input(body, { requireSecret: !current });

    return serializeS3(
      saveSingleS3Account({
        name: body.name,
        endpoint: String(body.endpoint).trim(),
        region: String(body.region || '').trim() || 'us-east-1',
        accessKeyId: String(body.accessKeyId).trim(),
        // 打码值 / 空值都传空串，交给 updateAccount 保留原密钥
        secretAccessKey: isMasked(body.secretAccessKey) && current ? '' : body.secretAccessKey,
        bucket: String(body.bucket).trim(),
        publicUrl: String(body.publicUrl || '').trim(),
        forcePathStyle: Boolean(body.forcePathStyle),
      }),
    );
  });

  app.post('/api/admin/storage/s3/test', guard, async (req) => {
    const body = req.body || {};
    const current = getSingleS3Account();
    validateS3Input(body, { requireSecret: !current });

    const secretAccessKey =
      isMasked(body.secretAccessKey) && current ? current.secretAccessKey : body.secretAccessKey;

    return testAccount({
      id: 0,
      name: 'S3 存储',
      provider: 's3',
      endpoint: String(body.endpoint).trim(),
      region: String(body.region || '').trim() || 'us-east-1',
      accessKeyId: String(body.accessKeyId).trim(),
      secretAccessKey,
      bucket: String(body.bucket).trim(),
      publicUrl: '',
      forcePathStyle: Boolean(body.forcePathStyle),
    });
  });

  /* ------------------------- R2 账号池 CRUD（多账号轮询） ------------------------- */
  app.get('/api/admin/storage/accounts', guard, async () =>
    listAccounts({ provider: 'r2' }).map(serializeAccount),
  );

  app.post('/api/admin/storage/accounts', guard, async (req) => {
    const body = req.body || {};
    validateAccountInput(body);
    return serializeAccount(
      createAccount({
        name: String(body.name).trim(),
        provider: 'r2', // 账号池仅用于 Cloudflare R2
        accountId: body.accountId,
        endpoint: body.endpoint,
        region: body.region,
        accessKeyId: String(body.accessKeyId).trim(),
        secretAccessKey: String(body.secretAccessKey),
        bucket: String(body.bucket).trim(),
        publicUrl: body.publicUrl,
        forcePathStyle: body.forcePathStyle,
        enabled: body.enabled,
        weight: body.weight,
      }),
    );
  });

  app.patch('/api/admin/storage/accounts/:id', guard, async (req) => {
    const id = Number(req.params.id);
    if (!getAccount(id)) throw notFound('存储账号不存在');
    validateAccountInput(req.body || {}, { partial: true });
    return serializeAccount(updateAccount(id, req.body || {}));
  });

  app.delete('/api/admin/storage/accounts/:id', guard, async (req) => {
    const id = Number(req.params.id);
    if (!getAccount(id)) throw notFound('存储账号不存在');
    deleteAccount(id);
    return { ok: true };
  });

  app.post('/api/admin/storage/accounts/:id/test', guard, async (req) => {
    const id = Number(req.params.id);
    const account = getAccount(id);
    if (!account) throw notFound('存储账号不存在');
    return testAccount(account);
  });

  /** 保存前先测试（新增 R2 账号时使用，账号还未入库） */
  app.post('/api/admin/storage/test', guard, async (req) => {
    const body = req.body || {};
    validateAccountInput(body);
    return testAccount({
      id: 0,
      name: body.name,
      provider: 'r2',
      accountId: body.accountId || '',
      endpoint: body.endpoint || '',
      region: body.region || 'auto',
      accessKeyId: String(body.accessKeyId).trim(),
      secretAccessKey: String(body.secretAccessKey),
      bucket: String(body.bucket).trim(),
      publicUrl: body.publicUrl || '',
      forcePathStyle: body.forcePathStyle ? 1 : 0,
    });
  });
}
