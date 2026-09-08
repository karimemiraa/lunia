import { randomBytes } from "crypto";
import { getRedis } from "@/lib/redis";

const TTL_SECONDS = 60 * 60 * 24 * 7;
const keyFor = (token: string) => `session:${token}`;

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await getRedis().set(keyFor(token), JSON.stringify({ userId }), "EX", TTL_SECONDS);
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
