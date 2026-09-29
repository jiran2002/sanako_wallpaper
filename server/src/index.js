import { config } from './config.js';
import { buildApp } from './app.js';
import { bootstrap } from './seed.js';
import { hasSharp } from './services/media.js';
import { listAccounts } from './services/storage/index.js';
import { getStorageConfig } from './services/settings.js';
import { startScheduler } from './services/tasks.js';

const created = bootstrap();

const app = await buildApp();

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

if (created) {
  app.log.warn(
    `已创建初始管理员账号：${created.username} / ${created.password}（请登录后立即修改密码）`,
  );
}

const storage = getStorageConfig();
app.log.info(`存储驱动：${storage.driver}${storage.driver === 'local' ? '' : `（策略 ${storage.strategy}）`}`);
if (storage.driver !== 'local') {
  const accounts = listAccounts({ onlyEnabled: true });
  app.log.info(`账号池：${accounts.length} 个启用账号 → ${accounts.map((a) => a.name).join('、') || '无'}`);
}
app.log.info(`缩略图生成：${(await hasSharp()) ? '已启用（sharp）' : '未启用（未安装 sharp，将直接使用原图）'}`);

// 每天一次的定时维护（数据库备份 + 孤儿文件清理）
startScheduler(app.log);
