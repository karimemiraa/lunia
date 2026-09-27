// Moyasar adapter (mada / Visa / Mastercard / Apple Pay) using the Invoices
// API: POST /v1/invoices creates a hosted payment page; GET /v1/invoices/:id
// is the source of truth for whether it was paid. Amounts are in halalas.
// Auth is HTTP Basic with the secret key as username and an empty password.

import type { CreateLinkInput, CreatedLink, LinkStatus, PaymentProvider } from "./provider";

export const MOYASAR_API = "https://api.moyasar.com/v1";

interface MoyasarInvoice {
  id: string;
  status: string; // initiated | paid | failed | expired | canceled | ...
  amount: number;
  currency: string;
  url?: string;
  payments?: { id: string; status: string; amount: number }[];
}

function authHeader(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

async function call<T>(secretKey: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${MOYASAR_API}${path}`, {
    ...init,
    headers: { Authorization: authHeader(secretKey), "Content-Type": "application/json", Accept: "application/json", ...init.headers },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok || !body) {
    throw new Error(`Moyasar ${init.method ?? "GET"} ${path} failed (${res.status})${body?.message ? `: ${body.message}` : ""}`);
  }
  return body;
}

function mapStatus(s: string): LinkStatus["status"] {
  if (s === "paid") return "PAID";
  if (s === "expired" || s === "canceled") return "EXPIRED";
  if (s === "failed") return "FAILED";
  return "PENDING";
}

export function makeMoyasarProvider(secretKey: string): PaymentProvider {
  return {
    id: "moyasar",
    async createLink(input: CreateLinkInput): Promise<CreatedLink> {
      const inv = await call<MoyasarInvoice>(secretKey, "/invoices", {
        method: "POST",
        body: JSON.stringify({
          amount: input.amountMinor,
          currency: "SAR",
          description: input.description,
          callback_url: input.callbackUrl,
          back_url: input.backUrl,
          success_url: input.successUrl,
          metadata: input.metadata,
        }),
      });
      if (!inv.id || !inv.url) throw new Error("Moyasar did not return a payment link");
      return { providerRef: inv.id, url: inv.url };
    },
    async fetchLink(providerRef: string): Promise<LinkStatus> {
      const inv = await call<MoyasarInvoice>(secretKey, `/invoices/${encodeURIComponent(providerRef)}`);
      const paid = inv.payments?.find((p) => p.status === "paid");
      return { providerRef: inv.id, status: mapStatus(inv.status), amountMinor: inv.amount, paymentRef: paid?.id };
    },
  };
}
