import { randomBytes } from "crypto";
import { getRedis } from "@/lib/redis";

const TTL_SECONDS = 60 * 60 * 24 * 7;
const keyFor = (token: string) => `session:${token}`;

// ttlSeconds lets short-lived sessions (e.g. a 1-hour "view as customer"
// preview) expire server-side regardless of the cookie's own lifetime.
export async function createSession(userId: string, ttlSeconds: number = TTL_SECONDS): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await getRedis().set(keyFor(token), JSON.stringify({ userId }), "EX", ttlSeconds);
  return token;
}

export async function getSession(token: string): Promise<{ userId: string } | null> {
  const raw = await getRedis().get(keyFor(token));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && typeof (parsed as { userId?: unknown }).userId === "string") {
      return { userId: (parsed as { userId: string }).userId };
    }
  } catch {
    // fall through to cleanup
  }
  // Corrupt or malformed value: drop it so it stops causing errors, treat as logged-out.
  await getRedis().del(keyFor(token));
  return null;
}

export async function destroySession(token: string): Promise<void> {
  await getRedis().del(keyFor(token));
}
