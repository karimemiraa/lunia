// Unguessable public link to one invoice (/[locale]/invoice/<token>) without a
// DB column: token = "<invoiceId>.<HMAC-SHA256(SESSION_SECRET, id)>". The id
// alone is useless without the server secret, and rotating SESSION_SECRET
// revokes every link at once.

import { createHmac, timingSafeEqual } from "crypto";
import { getEnv } from "@/lib/env";

function sign(invoiceId: string): string {
  return createHmac("sha256", getEnv().SESSION_SECRET).update(`invoice:${invoiceId}`).digest("base64url").slice(0, 32);
}

export function invoiceToken(invoiceId: string): string {
  return `${invoiceId}.${sign(invoiceId)}`;
}

/** The invoice id a token grants access to, or null if it was tampered with. */
export function verifyInvoiceToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(id));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return id;
}

export function invoicePublicUrl(invoiceId: string, locale: "ar" | "en" = "ar"): string {
  const base = getEnv().APP_URL.replace(/\/$/, "");
  return `${base}/${locale}/invoice/${invoiceToken(invoiceId)}`;
}
