import { randomInt, timingSafeEqual } from "crypto";
import { getRedis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { createSession, getSession, destroySession } from "./session";
import type { CommsSender } from "@/modules/booking/outbox";
import { getSmsSender } from "@/modules/comms/sender";
import { renderTemplate } from "@/modules/comms/templates";
import { redactOtpBody } from "@/modules/comms/redact";

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

export interface RequestOtpOptions {
  /** UI locale used to render the OTP SMS template. Defaults to "ar". */
  locale?: string;
  /**
   * Test-only injection point for the SMS sender. Production callers should
   * never pass this — it defaults to getSmsSender(), which itself only
   * returns a real provider adapter in production with a fully configured
   * comms provider, and the logging-only stub everywhere else (dev/test/CI).
   */
  sender?: CommsSender;
}

export async function requestOtp(phone: string, options: RequestOtpOptions = {}): Promise<{ devCode?: string }> {
  const normalized = normalizePhone(phone);
  const redis = getRedis();

  const count = await redis.incr(requestCountKey(normalized));
  if (count === 1) {
    await redis.expire(requestCountKey(normalized), REQUEST_WINDOW_SECONDS);
  }
  if (count > REQUEST_LIMIT) {
    throw new Error("Too many OTP requests for this phone number. Please try again later.");
  }

  // A freshly-issued code gets a fresh verify-attempt budget: without this, a
  // user who mistyped their way through OTP_MAX_VERIFY_ATTEMPTS on the old
  // code would still be locked out after requesting (and correctly entering)
  // a brand new one, since otpver:<phone> would still be sitting at the cap.
  await redis.del(verifyAttemptsKey(normalized));

  const code = generateCode();
  const record: OtpRecord = { code };
  await redis.set(otpKey(normalized), JSON.stringify(record), "EX", OTP_TTL_SECONDS);

  // Best-effort SMS delivery: outside production (or without a configured
  // SMS provider) getSmsSender() returns the logging-only stub, so this is
  // always safe to attempt. A send/log failure here must NEVER prevent
  // requestOtp from succeeding -- the code is already stored, so the user
  // can still verify it (and in non-production, devCode is returned below
  // regardless of whether the "send" succeeded).
  await sendOtpSms(normalized, code, options.locale ?? "ar", options.sender);

  if (getEnv().NODE_ENV !== "production") {
    return { devCode: code };
  }
  // Never log/return the code itself outside the SMS body sent to the user.
  return {};
}

// Renders the OTP template, hands it to the SMS sender, and records a
// CommunicationLog row for the attempt. Deliberately swallows every error
// (template render, sender.send rejecting/throwing, or the log write
// itself) so a provider outage can never break the OTP request flow --
// worst case, no SMS goes out and/or no audit row is written, but the code
// the user needs is already safely in Redis.
async function sendOtpSms(phone: string, code: string, locale: string, injectedSender?: CommsSender): Promise<void> {
  let body: string;
  try {
    body = (await renderTemplate("OTP", locale, "sms", { code })).body;
  } catch (err) {
    console.error("[requestOtp] failed to render OTP template", err);
    return;
  }

  const sender = injectedSender ?? getSmsSender();
  let result: { ok: boolean; providerRef?: string };
  try {
    result = await sender.send({ channel: "sms", toPhone: phone, body, kind: "OTP" });
  } catch (err) {
    console.error("[requestOtp] SMS sender threw", err);
    result = { ok: false };
  }

  try {
    // The audit row records that an OTP was sent, but MUST NOT store the code
    // itself (PDPL/security): redact it out of the persisted body. The real
    // code was already sent to the user's phone via sender.send above.
    await prisma.communicationLog.create({
      data: {
        channel: "sms",
        kind: "OTP",
        toPhone: phone,
        status: result.ok ? "SENT" : "FAILED",
        body: redactOtpBody(body, code),
        providerRef: result.providerRef ?? null,
      },
    });
  } catch (err) {
    console.error("[requestOtp] failed to write OTP CommunicationLog row", err);
  }
}

export interface VerifyOtpOptions {
  /**
   * Attribution source for a brand-new client. This is the ONLY chance to
   * record it: the public booking flow (book/actions.ts verifyAndBook) calls
   * verifyOtp before createBooking, so for a first-time phone number this
   * function -- not createBooking's own find-or-create -- is what actually
   * inserts the ClientProfile row. Ignored for a phone that already has a
   * profile (sourceChannel is never overwritten after first creation).
   */
  sourceChannel?: string | null;
}

export async function verifyOtp(
  phone: string,
  code: string,
  options: VerifyOtpOptions = {},
): Promise<{ userId: string } | null> {
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

  const user = await findOrCreateClientUser(normalized, options.sourceChannel ?? null);
  return { userId: user.id };
}

async function findOrCreateClientUser(phone: string, sourceChannel: string | null): Promise<{ id: string }> {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    const profile = await prisma.clientProfile.findUnique({ where: { userId: existing.id } });
    if (!profile) {
      await prisma.clientProfile.create({ data: { userId: existing.id, fullName: "", sourceChannel } });
    }
    return { id: existing.id };
  }

  const created = await prisma.user.create({
    data: {
      type: "CLIENT",
      phone,
      clientProfile: { create: { fullName: "", sourceChannel } },
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
