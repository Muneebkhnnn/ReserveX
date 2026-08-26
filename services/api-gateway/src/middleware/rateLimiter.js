import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379");

// Sliding-window-log rate limiter backed by a Redis sorted set.
// Key: rl:{identifier}   Members: unique per-request tokens, scored by request timestamp.
// More accurate than a fixed-window counter (no burst-at-the-boundary problem).

export function rateLimiter({ windowMs = 60_000, max = 30 } = {}) {
  return async (req, res, next) => {
    const identifier = req.headers["x-api-key"] || req.ip;
    const key = `rl:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(key, 0, windowStart); // drop entries outside the window
      pipeline.zadd(key, now, `${now}-${Math.random()}`); // record this request
      pipeline.zcard(key); // count requests currently in the window
      pipeline.pexpire(key, windowMs); // let idle keys expire on their own
      const results = await pipeline.exec();

      const count = results[2][1];

      res.set("X-RateLimit-Limit", String(max));
      res.set("X-RateLimit-Remaining", String(Math.max(0, max - count)));

      if (count > max) {
        return res.status(429).json({ error: "Too many requests, slow down" });
      }
      next();
    } catch (err) {
      console.error("rateLimiter error:", err);
      next(); // fail open — a Redis outage shouldn't take the whole API down
    }
  };
}
