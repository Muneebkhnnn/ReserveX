import Redis from "ioredis";
import { randomUUID } from "crypto";

const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379");

// Minimal single-instance distributed lock (the core idea behind Redlock).
// SET NX PX gives us atomic "acquire if free, with an expiry" in one round trip.
// Release uses a Lua script so we only delete the lock if we still own it —
// otherwise a slow request could delete a lock some other request already acquired
// after our TTL expired.

export async function withLock(key, ttlMs, fn) { /*key= which resource to lock (ticket:123) ttlMs → how long the lock should exist, fn → the work to perform after getting the lock */
  const token = randomUUID();
  const lockKey = `lock:${key}`;

  const acquired = await redis.set(lockKey, token, "PX", ttlMs, "NX");
  if (!acquired) {
    const err = new Error("Could not acquire lock, resource busy");
    err.code = "LOCK_BUSY";
    throw err;
  }

  try {
    return await fn();
  } finally {
    const releaseScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(releaseScript, 1, lockKey, token);
  }
}
