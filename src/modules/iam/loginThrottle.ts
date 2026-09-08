import { getRedis } from "@/lib/redis";

export const MAX_ATTEMPTS = 5;
export const WINDOW_SECONDS = 15 * 60;
export const LOCKOUT_SECONDS = 15 * 60;

const failKey = (key: string) => `loginfail:${key}`;
const lockKey = (key: string) => `loginlock:${key}`;

export async function checkLoginAllowed(key: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const ttl = await getRedis().ttl(lockKey(key));
  if (ttl > 0) return { allowed: false, retryAfterSeconds: ttl };
  return { allowed: true };
}

export async function recordLoginFailure(key: string): Promise<void> {
  const redis = getRedis();
  const count = await redis.incr(failKey(key));
  if (count === 1) await redis.expire(failKey(key), WINDOW_SECONDS);
  if (count >= MAX_ATTEMPTS) {
    await redis.set(lockKey(key), "1", "EX", LOCKOUT_SECONDS);
    await redis.del(failKey(key));
  }
}

export async function recordLoginSuccess(key: string): Promise<void> {
  await getRedis().del(failKey(key), lockKey(key));
}
