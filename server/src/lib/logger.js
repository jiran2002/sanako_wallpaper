import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';

/** 本地日期字符串，例如 2026-09-29（按天分文件，方便直接按日期翻日志） */
function dateKey(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * 按天轮转的日志流：每天写一个 app-YYYY-MM-DD.log，跨天时自动切到新文件，
 * 避免单个日志文件无限增长。同时把日志镜像到 stdout，保持容器/控制台可见。
 */
export function createDailyRotateStream(dir) {
  fs.mkdirSync(dir, { recursive: true });

  let currentDate = '';
  let fileStream = null;

  function ensureStream() {
    const today = dateKey();
    if (fileStream && currentDate === today) return;
    if (fileStream) fileStream.end();
    currentDate = today;
    fileStream = fs.createWriteStream(path.join(dir, `app-${today}.log`), { flags: 'a' });
    // 日志文件写失败（例如磁盘满）不应该拖垮进程，降级为只输出 stdout
    fileStream.on('error', () => {
      fileStream = null;
    });
  }

  return new Writable({
    write(chunk, _encoding, callback) {
      ensureStream();
      fileStream?.write(chunk);
      process.stdout.write(chunk);
      callback();
    },
  });
}