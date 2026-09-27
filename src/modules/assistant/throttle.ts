// Abuse guard for the public assistant (same Redis counter pattern as
// iam/loginThrottle.ts): fixed windows per chat session and per client IP,
// plus a cap on new sessions per IP. Fails open if Redis is unreachable so a
// cache outage never takes the chat down.

import { getRedis } from "@/lib/redis";

export const LIMITS = {
  sessionMessages: { max: 40, windowSeconds: 10 * 60 },
  ipMessages: { max: 240, windowSeconds: 60 * 60 },
  ipNewSessions: { max: 30, windowSeconds: 60 * 60 },
} as const;

export const MAX_MESSAGE_LENGTH = 600;

async function hit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const redis = getRedis();
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    return count <= max;
  } catch {
    return true;
  }
}

export async function allowMessage(sessionToken: string | null, ip: string): Promise<boolean> {
  const checks = [hit(`chatmsg:ip:${ip}`, LIMITS.ipMessages.max, LIMITS.ipMessages.windowSeconds)];
  if (sessionToken) checks.push(hit(`chatmsg:s:${sessionToken}`, LIMITS.sessionMessages.max, LIMITS.sessionMessages.windowSeconds));
  const results = await Promise.all(checks);
  return results.every(Boolean);
}

export async function allowNewSession(ip: string): Promise<boolean> {
  return hit(`chatnew:ip:${ip}`, LIMITS.ipNewSessions.max, LIMITS.ipNewSessions.windowSeconds);
}
