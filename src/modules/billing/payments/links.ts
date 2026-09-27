// Pay-by-link for issued invoices and the gateway webhook that settles them.
//
// Webhook authenticity is two-layered: a delivery carrying a secret_token
// must match the PAYMENT_WEBHOOK_SECRET configured on the gateway, and — for
// every delivery — the link's status is re-fetched from the gateway API with
// our secret key before anything is recorded, so a forged body can at most
// trigger a harmless status check. Recording is idempotent: the PENDING →
// PAID flip of the PaymentLink is an atomic conditional update, so repeated
// or concurrent deliveries record exactly one Payment.

import { timingSafeEqual } from "crypto";
import type { PaymentLink } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getSecret } from "@/modules/platform/secrets";
import { BillingError } from "../errors";
import { invoiceBalance, recordPayment } from "../settlement";
import { invoicePublicUrl } from "../token";
import { getPaymentProvider } from "./provider";

export async function onlinePaymentsConfigured(): Promise<boolean> {
  return (await getPaymentProvider()) !== null;
}

/** Creates (or reuses the pending) pay link for an invoice's open balance. */
export async function createPayLink(invoiceId: string, locale: "ar" | "en" = "ar"): Promise<PaymentLink> {
  const provider = await getPaymentProvider();
  if (!provider) throw new BillingError("Online payments are not configured (Superadmin → Payments)");

  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv || inv.kind !== "INVOICE") throw new BillingError("Invoice not found");
  if (inv.status !== "ISSUED" && inv.status !== "PARTIALLY_PAID") throw new BillingError("Only unpaid issued invoices can get a pay link");
  const { balanceMinor } = await invoiceBalance(prisma, inv);
  if (balanceMinor <= 0) throw new BillingError("Nothing is due on this invoice");

  const pending = await prisma.paymentLink.findFirst({
    where: { invoiceId, provider: provider.id, status: "PENDING", amountMinor: balanceMinor },
    orderBy: { createdAt: "desc" },
  });
  if (pending?.url) return pending;

  const viewUrl = invoicePublicUrl(inv.id, locale);
  const created = await provider.createLink({
    amountMinor: balanceMinor,
    description: `Lunia invoice ${inv.number}`,
    callbackUrl: `${getEnv().APP_URL.replace(/\/$/, "")}/api/payments/${provider.id}/webhook`,
    backUrl: viewUrl,
    successUrl: `${viewUrl}?paid=1`,
    metadata: { invoiceId: inv.id, invoiceNumber: inv.number },
  });
  return prisma.paymentLink.create({
    data: { invoiceId, provider: provider.id, providerRef: created.providerRef, url: created.url, amountMinor: balanceMinor },
  });
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type WebhookResult =
  | { status: 200; body: { ok: true; recorded: boolean; reason?: string } }
  | { status: 401 | 400 | 404 | 503; body: { ok: false; error: string } };

// Moyasar sends either a webhook event ({type, secret_token, data: payment})
// or, via the invoice callback_url, the invoice object itself ({id, status}).
export async function handleMoyasarWebhook(payload: unknown): Promise<WebhookResult> {
  if (!payload || typeof payload !== "object") return { status: 400, body: { ok: false, error: "Invalid payload" } };
  const p = payload as Record<string, unknown>;

  if (typeof p.secret_token === "string" || typeof p.type === "string") {
    const expected = await getSecret("PAYMENT_WEBHOOK_SECRET");
    if (!expected || typeof p.secret_token !== "string" || !safeEqual(p.secret_token, expected)) {
      return { status: 401, body: { ok: false, error: "Bad secret token" } };
    }
  }

  const data = (p.data && typeof p.data === "object" ? p.data : p) as Record<string, unknown>;
  const ref =
    typeof data.invoice_id === "string" ? data.invoice_id : typeof p.type !== "string" && typeof data.id === "string" ? data.id : null;
  if (!ref) return { status: 200, body: { ok: true, recorded: false, reason: "No invoice reference" } };

  const link = await prisma.paymentLink.findFirst({ where: { provider: "moyasar", providerRef: ref } });
  if (!link) return { status: 404, body: { ok: false, error: "Unknown payment link" } };
  if (link.status === "PAID") return { status: 200, body: { ok: true, recorded: false, reason: "Already recorded" } };

  const provider = await getPaymentProvider();
  if (!provider || provider.id !== "moyasar") return { status: 503, body: { ok: false, error: "Payments not configured" } };
  const remote = await provider.fetchLink(ref);

  if (remote.status === "FAILED" || remote.status === "EXPIRED") {
    await prisma.paymentLink.updateMany({ where: { id: link.id, status: "PENDING" }, data: { status: remote.status } });
    return { status: 200, body: { ok: true, recorded: false, reason: remote.status } };
  }
  if (remote.status !== "PAID") return { status: 200, body: { ok: true, recorded: false, reason: "Not paid yet" } };

  // Atomic claim — only one delivery gets past this line.
  const claimed = await prisma.paymentLink.updateMany({
    where: { id: link.id, status: "PENDING" },
    data: { status: "PAID", paidAt: new Date() },
  });
  if (claimed.count !== 1) return { status: 200, body: { ok: true, recorded: false, reason: "Already recorded" } };

  try {
    await recordPayment(
      {
        invoiceId: link.invoiceId,
        method: "ONLINE",
        amountMinor: remote.amountMinor,
        provider: "moyasar",
        providerRef: remote.paymentRef ?? ref,
        reference: `Moyasar ${ref}`,
      },
      { allowOverpay: true },
    );
  } catch (err) {
    // Release the claim so the gateway's retry can record it.
    await prisma.paymentLink.update({ where: { id: link.id }, data: { status: "PENDING", paidAt: null } });
    throw err;
  }
  return { status: 200, body: { ok: true, recorded: true } };
}
