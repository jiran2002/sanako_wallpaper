import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { HttpError } from '../../lib/http.js';

const REQUEST_TIMEOUT = 20_000;

/** R2 未显式填写 Endpoint 时，由 Account ID 推导 */
export function buildEndpoint(account) {
  const explicit = String(account.endpoint || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;
  if (account.provider === 'r2' && account.accountId) {
    return `https://${String(account.accountId).trim()}.r2.cloudflarestorage.com`;
  }
  return '';
}

export function createS3Client(account) {
  const endpoint = buildEndpoint(account);
  return new S3Client({
    region: account.region || (account.provider === 'r2' ? 'auto' : 'us-east-1'),
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(account.forcePathStyle),
    credentials: {
      accessKeyId: account.accessKeyId,
      secretAccessKey: account.secretAccessKey,
    },
  });
}

function withTimeout(promise, ms = REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return promise(controller.signal).finally(() => clearTimeout(timer));
}

function wrapError(err, action) {
  const name = err?.name || '';
  if (name === 'AbortError') return new HttpError(504, `${action}超时，请检查 Endpoint / 网络`);
  const detail = err?.message || String(err);
  return new HttpError(502, `${action}失败：${detail}`);
}

/**
 * 单个对象存储账号（S3 兼容，含 Cloudflare R2）的适配器。
 */
export function createRemoteStorage(account) {
  const client = createS3Client(account);
  const Bucket = account.bucket;

  return {
    kind: 'remote',
    accountId: account.id,

    async put(key, buffer, contentType) {
      try {
        await withTimeout((signal) =>
          client.send(
            new PutObjectCommand({
              Bucket,
              Key: key,
              Body: buffer,
              ContentType: contentType || 'application/octet-stream',
              CacheControl: 'public, max-age=31536000, immutable',
            }),
            { abortSignal: signal },
          ),
        );
        return { key, accountId: account.id };
      } catch (err) {
        throw wrapError(err, '上传对象');
      }
    },

    async remove(key) {
      try {
        await withTimeout((signal) =>
          client.send(new DeleteObjectCommand({ Bucket, Key: key }), { abortSignal: signal }),
        );
      } catch (err) {
        throw wrapError(err, '删除对象');
      }
    },

    async get(key) {
      try {
        const res = await withTimeout((signal) =>
          client.send(new GetObjectCommand({ Bucket, Key: key }), { abortSignal: signal }),
        );
        return {
          stream: res.Body,
          contentType: res.ContentType,
          contentLength: res.ContentLength,
        };
      } catch (err) {
        throw wrapError(err, '读取对象');
      }
    },

    /** 连通性测试：先列一次对象，再写入并删除一个探针对象 */
    async test() {
      const started = Date.now();
      try {
        await withTimeout((signal) =>
          client.send(new ListObjectsV2Command({ Bucket, MaxKeys: 1 }), { abortSignal: signal }),
        );
        const probeKey = `.wallpaper-hub-check-${Date.now()}`;
        await withTimeout((signal) =>
          client.send(
            new PutObjectCommand({ Bucket, Key: probeKey, Body: Buffer.from('ok') }),
            { abortSignal: signal },
          ),
        );
        await withTimeout((signal) =>
          client.send(new DeleteObjectCommand({ Bucket, Key: probeKey }), { abortSignal: signal }),
        );
        return { ok: true, message: `连接正常，读写耗时 ${Date.now() - started}ms` };
      } catch (err) {
        return { ok: false, message: err?.message || String(err) };
      }
    },
  };
}
