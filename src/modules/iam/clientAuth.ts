import { randomInt, timingSafeEqual } from "crypto";
import { getRedis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { createSession, getSession, destroySession } from "./session";
import { hashPassword, verifyPassword } from "./password";
import type { CommsSender } from "@/modules/booking/outbox";
import { resolveSenderForChannel } from "@/modules/comms/sender";
import { resolveBookingChannel } from "@/modules/booking/outbox";
import { getCommsConfig } from "@/modules/comms/config";
import { renderTemplate } from "@/modules/comms/templates";
import { redactOtpBody } from "@/modules/comms/redact";
import { getPreference, prefToChannel } from "@/modules/comms/preferences";
import { getSetting } from "@/modules/cms/settings";

/** Cookie name for client (customer) sessions — distinct from the staff `lunia_session` cookie. */
export const CLIENT_SESSION_COOKIE = "lunia_client_session";

const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_VERIFY_ATTEMPTS = 5;

const REQUEST_WINDOW_SECONDS = 60 * 60;
const REQUEST_LIMIT = 5;

interface OtpRecord {
  code: string;
}

// An OTP identifier is either a phone number or an email address. The kind
// determines both how the client is looked up / created and which channels
// the code can be delivered on (you cannot SMS an email or email a phone).
export type IdentifierKind = "phone" | "email";
export interface Identifier {
  kind: IdentifierKind;
  value: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Normalizes and classifies a raw login identifier. Emails are lowercased;
// phones keep an optional leading "+" and 6-20 digits.
export function resolveIdentifier(raw: string): Identifier {
  const trimmed = raw.trim();
  if (trimmed.includes("@")) {
    const value = trimmed.toLowerCase();
    if (!EMAIL_RE.test(value)) throw new Error("Invalid email address");
    return { kind: "email", value };
  }
  if (!/^\+?[0-9]{6,20}$/.test(trimmed)) {
    throw new Error("Invalid phone number");
  }
  return { kind: "phone", value: trimmed };
}

const keyBase = (id: Identifier) => `${id.kind}:${id.value}`;
const otpKey = (id: Identifier) => `otp:${keyBase(id)}`;
const requestCountKey = (id: Identifier) => `otpreq:${keyBase(id)}`;
const verifyAttemptsKey = (id: Identifier) => `otpver:${keyBase(id)}`;

/** Constant-time comparison of two OTP codes (length-guarded). */
function codesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// Chooses the delivery channel for an OTP:
//   - email identifier  -> always "email" (only deliverable channel),
//   - phone identifier   -> "sms" or "whatsapp" from: explicit option, the
//     client's stored preference (if SMS/WhatsApp), the global comms setting
//     (SiteSetting "comms".otpChannel), else the booking channel.
async function resolveOtpChannel(
  id: Identifier,
  clientProfileId: string | null,
  explicit?: string,
): Promise<string> {
  if (explicit) return explicit;
  if (id.kind === "email") return "email";

  const pref = clientProfileId ? await getPreference(clientProfileId) : null;
  const p = pref ? prefToChannel(pref.channel) : null;
  if (p === "sms" || p === "whatsapp") return p;

  const comms = await getSetting("comms").catch(() => null);
  const g = comms ? prefToChannel(comms.otpChannel) : null;
  if (g === "sms" || g === "whatsapp") return g;

  const bc = resolveBookingChannel(getCommsConfig());
  return bc === "sms" ? "sms" : "whatsapp";
}

function otpSubject(locale: string): string {
  return locale.toLowerCase().startsWith("ar") ? "رمز الدخول إلى لونيا" : "Your Lunia code";
}

export interface RequestOtpOptions {
  /** UI locale used to render the OTP template. Defaults to "ar". */
  locale?: string;
  /** Force a specific delivery channel (e.g. from an account "send via" action). */
  channel?: string;
  /** Test-only sender injection. Production defaults to resolveSenderForChannel. */
  sender?: CommsSender;
}

export async function requestOtp(
  identifierRaw: string,
  options: RequestOtpOptions = {},
): Promise<{ devCode?: string }> {
  const id = resolveIdentifier(identifierRaw);
  const redis = getRedis();

  const count = await redis.incr(requestCountKey(id));
  if (count === 1) {
    await redis.expire(requestCountKey(id), REQUEST_WINDOW_SECONDS);
  }
  if (count > REQUEST_LIMIT) {
    throw new Error("Too many code requests. Please try again later.");
  }

  // Fresh code -> fresh verify-attempt budget.
  await redis.del(verifyAttemptsKey(id));

  const code = generateCode();
  const record: OtpRecord = { code };
  await redis.set(otpKey(id), JSON.stringify(record), "EX", OTP_TTL_SECONDS);

  await sendOtp(id, code, options.locale ?? "ar", options.channel, options.sender);

  if (getEnv().NODE_ENV !== "production") {
    return { devCode: code };
  }
  return {};
}

// Renders + delivers the OTP over the resolved channel and records a redacted
// CommunicationLog row. Never throws: a delivery/log failure must not prevent
// requestOtp from succeeding (the code is already stored for verification).
async function sendOtp(
  id: Identifier,
  code: string,
  locale: string,
  explicitChannel: string | undefined,
  injectedSender: CommsSender | undefined,
): Promise<void> {
  // Existing client (if any) so we can honor their channel preference.
  const existing = await prisma.user
    .findUnique({
      where: id.kind === "phone" ? { phone: id.value } : { email: id.value },
      include: { clientProfile: { select: { id: true, fullName: true } } },
    })
    .catch(() => null);
  const clientProfileId = existing?.clientProfile?.id ?? null;
  const recipientName = existing?.clientProfile?.fullName?.trim() || undefined;

  const channel = await resolveOtpChannel(id, clientProfileId, explicitChannel);

  let body: string;
  try {
    body = (await renderTemplate("OTP", locale, channel, { code })).body;
  } catch (err) {
    console.error("[requestOtp] failed to render OTP template", err);
    return;
  }

  const sender = injectedSender ?? (await resolveSenderForChannel(channel));
  const toPhone = id.kind === "phone" ? id.value : undefined;
  const toEmail = id.kind === "email" ? id.value : undefined;

  let result: { ok: boolean; providerRef?: string };
  try {
    result = await sender.send({
      channel,
      toPhone,
      toEmail,
      subject: channel === "email" ? otpSubject(locale) : undefined,
      body,
      kind: "OTP",
      recipientName,
      locale,
    });
  } catch (err) {
    console.error("[requestOtp] OTP sender threw", err);
    result = { ok: false };
  }

  try {
    // The stored audit row MUST NOT contain the code (redact it); the real
    // code went to the user's phone/inbox via sender.send above.
    await prisma.communicationLog.create({
      data: {
        channel,
        kind: "OTP",
        toPhone: toPhone ?? null,
        toEmail: toEmail ?? null,
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
   * Attribution source for a brand-new client (recorded only on first
   * creation; never overwritten). See the public booking flow.
   */
  sourceChannel?: string | null;
  /**
   * Display name captured at sign-in. Set on a brand-new client, and used to
   * backfill an existing client whose name was never recorded (an OTP-created
   * "" name). Never overwrites an already-set name.
   */
  name?: string | null;
}

export async function verifyOtp(
  identifierRaw: string,
  code: string,
  options: VerifyOtpOptions = {},
): Promise<{ userId: string } | null> {
  const id = resolveIdentifier(identifierRaw);
  const redis = getRedis();

  const verKey = verifyAttemptsKey(id);
  const attempts = await redis.incr(verKey);
  if (attempts === 1) {
    await redis.expire(verKey, OTP_TTL_SECONDS);
  }
  if (attempts > OTP_MAX_VERIFY_ATTEMPTS) {
    await redis.del(otpKey(id));
    return null;
  }

  const raw = await redis.get(otpKey(id));
  if (!raw) return null;

  const record = JSON.parse(raw) as OtpRecord;
  if (!codesMatch(record.code, code)) return null;

  await redis.del(otpKey(id), verKey);

  const user = await findOrCreateClientUser(id, options.sourceChannel ?? null, cleanName(options.name));
  return { userId: user.id };
}

// Trims a submitted name to a sane length; empty/whitespace becomes undefined.
function cleanName(raw: string | null | undefined): string | undefined {
  const trimmed = (raw ?? "").trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
}

async function findOrCreateClientUser(
  id: Identifier,
  sourceChannel: string | null,
  name?: string,
): Promise<{ id: string }> {
  const where = id.kind === "phone" ? { phone: id.value } : { email: id.value };
  const existing = await prisma.user.findUnique({ where });
  if (existing) {
    const profile = await prisma.clientProfile.findUnique({ where: { userId: existing.id } });
    if (!profile) {
      await prisma.clientProfile.create({ data: { userId: existing.id, fullName: name ?? "", sourceChannel } });
    } else if (name && !profile.fullName.trim()) {
      // Backfill a name onto a profile that never had one; never overwrite.
      await prisma.clientProfile.update({ where: { id: profile.id }, data: { fullName: name } });
    }
    return { id: existing.id };
  }

  const created = await prisma.user.create({
    data: {
      type: "CLIENT",
      phone: id.kind === "phone" ? id.value : null,
      email: id.kind === "email" ? id.value : null,
      clientProfile: { create: { fullName: name ?? "", sourceChannel } },
    },
  });
  return { id: created.id };
}

// A fixed bcrypt hash (cost 12) of a random string, matching staff auth's
// DUMMY_HASH pattern: when no eligible client account exists we still run a
// verify against this so the response time doesn't reveal whether the account
// exists (user-enumeration timing). Corresponds to no real password.
const DUMMY_HASH = "$2b$12$mq5XQoDKh5rx3rB9EzoBnejbJbmMr5iAYhlNrsCTAzaoVCT1jpp/y";

/** Minimum client password length (kept modest for a consumer account). */
export const MIN_CLIENT_PASSWORD_LENGTH = 8;

/**
 * Authenticates a client by identifier (phone OR email) + password. Returns
 * the user id on success, or null. Runs a constant-cost bcrypt compare on
 * every path so an absent/passwordless account is indistinguishable by timing
 * from a wrong password.
 */
export async function authenticateClient(
  identifierRaw: string,
  password: string,
): Promise<{ userId: string } | null> {
  let id: Identifier;
  try {
    id = resolveIdentifier(identifierRaw);
  } catch {
    // Still spend a compare so an invalid identifier costs the same.
    await verifyPassword(password, DUMMY_HASH);
    return null;
  }

  const user = await prisma.user.findUnique({
    where: id.kind === "phone" ? { phone: id.value } : { email: id.value },
  });
  const eligible = Boolean(user && user.isActive && user.passwordHash && user.type === "CLIENT");
  const hash = eligible ? user!.passwordHash! : DUMMY_HASH;
  const ok = await verifyPassword(password, hash);
  return ok && eligible ? { userId: user!.id } : null;
}

/** Sets (or replaces) a client's login password. Caller must own the session. */
export async function setClientPassword(userId: string, plain: string): Promise<void> {
  if (plain.length < MIN_CLIENT_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_CLIENT_PASSWORD_LENGTH} characters`);
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { type: true } });
  if (!user || user.type !== "CLIENT") throw new Error("Not a client account");
  const passwordHash = await hashPassword(plain);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

/** Whether the client already has a password set (drives the account UI). */
export async function clientHasPassword(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  return Boolean(user?.passwordHash);
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
