/**
 * 极简内存滑动窗口限流：按 key（通常是 IP 或 用户 id）统计窗口内的请求次数。
 * 只适合单进程部署；多实例时应换成 Redis 之类的共享计数。
 */
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  let lastPrune = 0;

  /** 顺带清掉过期的记录，避免 Map 无限增长 */
  function prune(now) {
    for (const [key, list] of hits) {
      const kept = list.filter((time) => now - time < windowMs);
      if (kept.length === 0) hits.delete(key);
      else hits.set(key, kept);
    }
  }

  return {
    /** 记一次请求：超限时返回 ok=false 与建议的重试秒数 */
    hit(key) {
      const now = Date.now();
      if (now - lastPrune >= windowMs) {
        prune(now);
        lastPrune = now;
      }
      const list = (hits.get(key) || []).filter((time) => now - time < windowMs);
      if (list.length >= max) {
        hits.set(key, list);
        return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now - list[0])) / 1000)) };
      }
      list.push(now);
      hits.set(key, list);
      return { ok: true, remaining: max - list.length };
    },
  };
}