import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from '../../lib/http.js';

/**
 * 本机存储适配器。
 * 只负责文件读写，公开访问地址由 services/storage/index.js 统一解析。
 */
export function createLocalStorage({ dir }) {
  const root = path.resolve(dir);

  function toPath(key) {
    const target = path.resolve(root, key);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new HttpError(400, '非法的存储路径');
    }
    return target;
  }

  return {
    kind: 'local',
    accountId: null,
    root,
    async put(key, buffer) {
      const file = toPath(key);
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(file, buffer);
      return { key, accountId: null };
    },
    async remove(key) {
      await fs.promises.rm(toPath(key), { force: true });
    },
    async stat(key) {
      const file = toPath(key);
      const s = await fs.promises.stat(file);
      return { size: s.size, path: file };
    },
    createReadStream(key) {
      return fs.createReadStream(toPath(key));
    },
    async test() {
      await fs.promises.mkdir(root, { recursive: true });
      const probe = path.join(root, '.write-test');
      await fs.promises.writeFile(probe, 'ok');
      await fs.promises.rm(probe, { force: true });
      return { ok: true, message: `本机目录可写：${root}` };
    },
  };
}
