// Unguessable, expiring public link to one invoice (/[locale]/invoice/<token>)
// without a DB column:
//   token = "<invoiceId>_<expiry, unix days in base36>_<HMAC-SHA256(SESSION_SECRET) as 32 hex>"
// The id alone is useless without the server secret, the expiry is covered by
// the signature, and rotating SESSION_SECRET revokes every link at once. Every
// send mints a fresh link valid for INVOICE_LINK_DAYS. Legacy links (no expiry,
// "<id>_<sig>") are honoured until LEGACY_LINKS_UNTIL so links already sent
// before expiry shipped don't die overnight. No "." in the token: the proxy
// matcher treats dotted paths as static files and would skip the locale and
// security-header middleware.

import { createHmac, timingSafeEqual } from "crypto";
import { getEnv } from "@/lib/env";

export const INVOICE_LINK_DAYS = 60;
export const LEGACY_LINKS_UNTIL = new Date("2026-12-14T00:00:00+03:00");
const DAY_MS = 86_400_000;

function hmac(payload: string): string {
  return createHmac("sha256", getEnv().SESSION_SECRET).update(payload).digest("hex").slice(0, 32);
}
const legacySign = (invoiceId: string) => hmac(`invoice:${invoiceId}`);
const sign = (invoiceId: string, expDay: string) => hmac(`invoice2:${invoiceId}:${expDay}`);

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function invoiceToken(invoiceId: string, now: Date = new Date()): string {
  const expDay = (Math.floor(now.getTime() / DAY_MS) + INVOICE_LINK_DAYS).toString(36);
  return `${invoiceId}_${expDay}_${sign(invoiceId, expDay)}`;
}

export type InvoiceTokenCheck = { id: string; expired: false } | { id: string; expired: true } | null;

/** Which invoice a token grants access to and whether it has expired; null if forged or tampered with. */
export function checkInvoiceToken(token: string, now: Date = new Date()): InvoiceTokenCheck {
  const parts = token.split("_");
  if (parts.length === 2) {
    const [id, sig] = parts as [string, string];
    if (!id || !same(sig, legacySign(id))) return null;
    return { id, expired: now.getTime() >= LEGACY_LINKS_UNTIL.getTime() };
  }
  if (parts.length === 3) {
    const [id, expDay, sig] = parts as [string, string, string];
    if (!id || !/^[0-9a-z]{1,8}$/.test(expDay) || !same(sig, sign(id, expDay))) return null;
    return { id, expired: Math.floor(now.getTime() / DAY_MS) >= parseInt(expDay, 36) };
  }
  return null;
}

/** The invoice id a token grants access to, or null if forged, tampered with or expired. */
export function verifyInvoiceToken(token: string, now: Date = new Date()): string | null {
  const r = checkInvoiceToken(token, now);
  return r && !r.expired ? r.id : null;
}

export function invoicePublicUrl(invoiceId: string, locale: "ar" | "en" = "ar"): string {
  const base = getEnv().APP_URL.replace(/\/$/, "");
  return `${base}/${locale}/invoice/${invoiceToken(invoiceId)}`;
}
