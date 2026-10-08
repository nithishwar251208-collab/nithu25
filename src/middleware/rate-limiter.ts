import { config } from '../config/index.ts';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const ipMap = new Map<string, RateLimitRecord>();

// Cleanup stale records periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of ipMap.entries()) {
    if (record.resetAt <= now) {
      ipMap.delete(key);
    }
  }
}, 60000);

export function checkRateLimit(clientIp: string): { allowed: boolean; remaining: number; resetInSec: number } {
  const now = Date.now();
  let record = ipMap.get(clientIp);

  if (!record || record.resetAt <= now) {
    record = {
      count: 1,
      resetAt: now + config.rateLimit.windowMs,
    };
    ipMap.set(clientIp, record);
    return {
      allowed: true,
      remaining: config.rateLimit.max - 1,
      resetInSec: Math.ceil(config.rateLimit.windowMs / 1000),
    };
  }

  record.count++;
  const allowed = record.count <= config.rateLimit.max;
  const remaining = Math.max(0, config.rateLimit.max - record.count);
  const resetInSec = Math.ceil((record.resetAt - now) / 1000);

  return { allowed, remaining, resetInSec };
}
