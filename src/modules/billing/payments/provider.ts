// Provider-agnostic online "pay by link". A gateway adapter creates a hosted
// payment page for an amount and can later confirm, server-to-server, whether
// that page was paid. The gateway is chosen in Superadmin → Payments
// (PAYMENT_PROVIDER + PAYMENT_SECRET_KEY); only Moyasar is implemented.

import { getSecret } from "@/modules/platform/secrets";
import { makeMoyasarProvider } from "./moyasar";

export interface CreateLinkInput {
  amountMinor: number;
  description: string;
  /** Server-to-server notification URL. */
  callbackUrl: string;
  /** Where the hosted page's "back" and success redirects go. */
  backUrl: string;
  successUrl: string;
  metadata?: Record<string, string>;
}

export interface CreatedLink {
  providerRef: string;
  url: string;
}

export interface LinkStatus {
  providerRef: string;
  status: "PAID" | "PENDING" | "FAILED" | "EXPIRED";
  amountMinor: number;
  /** The gateway's id of the captured payment, when paid. */
  paymentRef?: string;
}

export interface PaymentProvider {
  readonly id: string;
  createLink(input: CreateLinkInput): Promise<CreatedLink>;
  fetchLink(providerRef: string): Promise<LinkStatus>;
}

/** The configured gateway, or null when online payments are not set up. */
export async function getPaymentProvider(): Promise<PaymentProvider | null> {
  const [provider, secretKey] = await Promise.all([getSecret("PAYMENT_PROVIDER"), getSecret("PAYMENT_SECRET_KEY")]);
  if (!provider || !secretKey) return null;
  if (provider.trim().toLowerCase() === "moyasar") return makeMoyasarProvider(secretKey);
  return null;
}
