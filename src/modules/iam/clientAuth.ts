import { randomInt, timingSafeEqual } from "crypto";
import { getRedis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { createSession, getSession, destroySession } from "./session";

/** Cookie name for client (customer) sessions — distinct from the staff `lunia_session` cookie. */
export const CLIENT_SESSION_COOKIE = "lunia_client_session";

const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_VERIFY_ATTEMPTS = 5;

const REQUEST_WINDOW_SECONDS = 60 * 60;
const REQUEST_LIMIT = 5;

interface OtpRecord {
  code: string;
}

const otpKey = (phone: string) => `otp:${phone}`;
const requestCountKey = (phone: string) => `otpreq:${phone}`;
const verifyAttemptsKey = (phone: string) => `otpver:${phone}`;

/** Constant-time comparison of two OTP codes. Guards on length first (timingSafeEqual
 * throws on mismatched buffer lengths) — a length mismatch is just treated as "not equal"
 * without leaking timing info about the code content itself. */
function codesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Basic phone validation/normalization: trims whitespace, requires an optional
 * leading `+` followed by 6-20 digits. Not a full E.164 validator — good enough
 * for a dev-mode OTP flow; real formatting/carrier checks arrive with Stage 6 SMS.
 */
function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (!/^\+?[0-9]{6,20}$/.test(trimmed)) {
    throw new Error("Invalid phone number");
  }
  return trimmed;
}

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function requestOtp(phone: string): Promise<{ devCode?: string }> {
  const normalized = normalizePhone(phone);
  const redis = getRedis();

  const count = await redis.incr(requestCountKey(normalized));
  if (count === 1) {
    await redis.expire(requestCountKey(normalized), REQUEST_WINDOW_SECONDS);
  }
  if (count > REQUEST_LIMIT) {
    throw new Error("Too many OTP requests for this phone number. Please try again later.");
  }

  const code = generateCode();
  const record: OtpRecord = { code };
  await redis.set(otpKey(normalized), JSON.stringify(record), "EX", OTP_TTL_SECONDS);

  if (getEnv().NODE_ENV !== "production") {
    return { devCode: code };
  }
  // Real SMS delivery lands in Stage 6. Never log the code in production.
  return {};
}

export async function verifyOtp(phone: string, code: string): Promise<{ userId: string } | null> {
  const normalized = normalizePhone(phone);
  const redis = getRedis();

  // Atomic brute-force cap: INCR is a single atomic Redis operation, so concurrent
  // wrong guesses can't race past OTP_MAX_VERIFY_ATTEMPTS the way a read-modify-write
  // on the OTP record itself could. The counter shares the OTP's TTL window.
  const verKey = verifyAttemptsKey(normalized);
  const attempts = await redis.incr(verKey);
  if (attempts === 1) {
    await redis.expire(verKey, OTP_TTL_SECONDS);
  }
  if (attempts > OTP_MAX_VERIFY_ATTEMPTS) {
    // Too many wrong attempts — invalidate the code so it can't be brute-forced further,
    // even by a subsequent correct-code submission.
    await redis.del(otpKey(normalized));
    return null;
  }

  const raw = await redis.get(otpKey(normalized));
  if (!raw) return null;

  const record = JSON.parse(raw) as OtpRecord;

  if (!codesMatch(record.code, code)) {
    // Wrong guess — already counted by the INCR above, nothing else to update.
    return null;
  }

  await redis.del(otpKey(normalized), verKey);

  const user = await findOrCreateClientUser(normalized);
  return { userId: user.id };
}

async function findOrCreateClientUser(phone: string): Promise<{ id: string }> {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    const profile = await prisma.clientProfile.findUnique({ where: { userId: existing.id } });
    if (!profile) {
      await prisma.clientProfile.create({ data: { userId: existing.id, fullName: "", sourceChannel: null } });
    }
    return { id: existing.id };
  }

  const created = await prisma.user.create({
    data: {
      type: "CLIENT",
      phone,
      clientProfile: { create: { fullName: "", sourceChannel: null } },
    },
  });
  return { id: created.id };
}

export async function createClientSession(userId: string): Promise<string> {
  return createSession(userId);
}

export async function getClientSessionUser(token: string): Promise<{ id: string } | null> {
  const session = await getSession(token);
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.isActive || user.type !== "CLIENT") return null;
  return { id: user.id };
}

export async function destroyClientSession(token: string): Promise<void> {
  await destroySession(token);
}
