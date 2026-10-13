import { getRedis } from "@/lib/redis";

/**
 * Fixed-window counter: returns false once `key` has been hit more than
 * `limit` times in the current `windowSeconds`. Fails OPEN if Redis is down
 * (a limiter outage must not take the public site down with it).
 */
export async function hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const redis = getRedis();
    const k = `rl:${key}`;
    const count = await redis.incr(k);
    if (count === 1) await redis.expire(k, windowSeconds);
    return count <= limit;
  } catch (err) {
    console.error("[rateLimit] redis unavailable, allowing", err);
    return true;
  }
}
