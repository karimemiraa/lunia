// Taking payments against issued invoices and keeping Invoice.status /
// paidMinor in step with the Payment ledger.
//
// Balance model (credit notes included):
//   due  = invoice total − Σ issued credit-note totals
//   paid = Σ payments on the invoice − Σ refunds on its credit notes
//   PAID when paid ≥ due, PARTIALLY_PAID when 0 < paid < due, else ISSUED.
// Invoice.paidMinor stores that NET paid amount (payments minus refunds made
// through its credit notes) but never the credited amounts themselves, so
// accounting's "outstanding = total − paidMinor − Σ credit notes" holds.
// Refunds are negative Payment rows on the credit note that justifies them.

import { z } from "zod";
import type { Prisma, Invoice, Payment, PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { redeemGiftCard } from "@/modules/commerce/giftcards";
import { consumePackageSession } from "@/modules/commerce/packages";
import { BillingError } from "./errors";

type Tx = Prisma.TransactionClient;
const TX_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;

/** Row-locks an invoice for the rest of the transaction. */
export async function lockInvoice(tx: Tx, invoiceId: string): Promise<Invoice> {
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
  const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw new BillingError("Invoice not found");
  return inv;
}

/** The currently open front-desk cash drawer, if any. */
export async function openCashSessionId(tx: Tx | typeof prisma = prisma): Promise<string | null> {
  const s = await tx.cashSession.findFirst({ where: { closedAt: null }, orderBy: { openedAt: "desc" }, select: { id: true } });
  return s?.id ?? null;
}

export interface InvoiceBalance {
  dueMinor: number;
  paidMinor: number;
  creditedMinor: number;
  refundedMinor: number;
  balanceMinor: number;
}

export async function invoiceBalance(tx: Tx | typeof prisma, inv: Pick<Invoice, "id" | "totalMinor">): Promise<InvoiceBalance> {
  const [paid, credits, refunds] = await Promise.all([
    tx.payment.aggregate({ where: { invoiceId: inv.id, status: "COMPLETED" }, _sum: { amountMinor: true } }),
    tx.invoice.aggregate({
      where: { originalInvoiceId: inv.id, kind: "CREDIT_NOTE", status: { not: "VOID" } },
      _sum: { totalMinor: true },
    }),
    tx.payment.aggregate({
      where: { invoice: { originalInvoiceId: inv.id }, status: "COMPLETED" },
      _sum: { amountMinor: true },
    }),
  ]);
  const paidOn = paid._sum.amountMinor ?? 0;
  const creditedMinor = credits._sum.totalMinor ?? 0;
  const refundedMinor = -(refunds._sum.amountMinor ?? 0);
  const dueMinor = inv.totalMinor - creditedMinor;
  const netPaid = paidOn - refundedMinor;
  return { dueMinor, paidMinor: paidOn, creditedMinor, refundedMinor, balanceMinor: dueMinor - netPaid };
}

// Recomputes status + paidMinor of an issued INVOICE from the ledger and,
// once it is fully paid, marks its booking's deposit PAID.
export async function settleInvoice(tx: Tx, invoiceId: string): Promise<Invoice> {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (inv.kind !== "INVOICE" || inv.status === "DRAFT" || inv.status === "VOID") return inv;
  const b = await invoiceBalance(tx, inv);
  const netPaid = b.paidMinor - b.refundedMinor;
  const status = b.balanceMinor <= 0 ? "PAID" : netPaid > 0 ? "PARTIALLY_PAID" : "ISSUED";
  const updated = await tx.invoice.update({ where: { id: invoiceId }, data: { status, paidMinor: netPaid } });
  if (status === "PAID" && inv.bookingId) {
    await tx.booking.updateMany({ where: { id: inv.bookingId }, data: { depositStatus: "PAID" } });
  }
  return updated;
}

const paymentSchema = z
  .object({
    invoiceId: z.string().min(1),
    method: z.enum(["CASH", "CARD", "MADA", "APPLE_PAY", "BANK_TRANSFER", "GIFT_CARD", "PACKAGE", "ONLINE", "OTHER"]),
    amountMinor: z.number().int().positive(),
    /** CASH only: what the customer handed over (change is returned). */
    tenderedMinor: z.number().int().positive().optional(),
    reference: z.string().trim().max(200).optional(),
    giftCardCode: z.string().trim().min(4).max(40).optional(),
    packagePurchaseId: z.string().min(1).optional(),
    provider: z.string().max(40).optional(),
    providerRef: z.string().max(200).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.method !== "GIFT_CARD" || !!v.giftCardCode, { message: "Enter the gift card code" })
  .refine((v) => v.method !== "PACKAGE" || !!v.packagePurchaseId, { message: "Choose the package to redeem" });
export type RecordPaymentInput = z.input<typeof paymentSchema>;

export interface RecordPaymentResult {
  payment: Payment;
  invoice: Invoice;
  /** Change to hand back for a CASH payment tendered above the balance. */
  changeMinor: number;
}

function maskCode(code: string): string {
  return `Gift card ••••${code.replace(/[^A-Za-z0-9]/g, "").slice(-4)}`;
}

/**
 * Records one payment (call repeatedly for a split payment). The amount may
 * not exceed the open balance — except CASH with tenderedMinor (the excess is
 * returned as change) and captured ONLINE payments (money already taken, so
 * it is recorded even if staff took another payment meanwhile).
 */
export async function recordPayment(
  raw: RecordPaymentInput,
  opts: { actorId?: string; allowOverpay?: boolean } = {},
): Promise<RecordPaymentResult> {
  const input = paymentSchema.parse(raw);
  const allowOverpay = opts.allowOverpay ?? input.method === "ONLINE";

  const pre = await prisma.invoice.findUnique({ where: { id: input.invoiceId } });
  if (!pre) throw new BillingError("Invoice not found");
  if (pre.kind !== "INVOICE") throw new BillingError("Payments are taken on invoices, not credit notes");
  if (pre.status === "DRAFT") throw new BillingError("Issue the invoice before taking payment");
  if (pre.status === "VOID") throw new BillingError("This invoice is void");
  const preBalance = (await invoiceBalance(prisma, pre)).balanceMinor;

  let amount = input.amountMinor;
  let changeMinor = 0;
  if (input.method === "CASH" && input.tenderedMinor !== undefined) {
    amount = Math.min(input.tenderedMinor, preBalance);
    changeMinor = input.tenderedMinor - amount;
  }
  if (!allowOverpay && (preBalance <= 0 || amount > preBalance)) {
    throw new BillingError(preBalance <= 0 ? "This invoice is already paid" : "Amount is more than the balance due");
  }
  if (amount <= 0) throw new BillingError("Nothing to pay");

  // Balance-bearing instruments are consumed first (each runs its own
  // serializable transaction); the payment row records what was applied.
  let reference = input.reference ?? null;
  if (input.method === "GIFT_CARD") {
    await redeemGiftCard(input.giftCardCode!, amount, pre.bookingId ?? undefined);
    reference = maskCode(input.giftCardCode!);
  } else if (input.method === "PACKAGE") {
    await consumePackageSession(input.packagePurchaseId!, pre.bookingId ?? undefined);
    reference = reference ?? `Package ${input.packagePurchaseId}`;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const inv = await lockInvoice(tx, input.invoiceId);
      const balance = (await invoiceBalance(tx, inv)).balanceMinor;
      if (!allowOverpay && amount > balance) throw new BillingError("Another payment was just recorded — refresh and try again");
      const payment = await tx.payment.create({
        data: {
          invoiceId: inv.id,
          method: input.method as PaymentMethod,
          amountMinor: amount,
          reference,
          provider: input.provider ?? null,
          providerRef: input.providerRef ?? null,
          receivedById: opts.actorId ?? null,
          cashSessionId: input.method === "CASH" ? await openCashSessionId(tx) : null,
          note: input.note ?? null,
        },
      });
      const invoice = await settleInvoice(tx, inv.id);
      return { payment, invoice, changeMinor };
    }, TX_OPTIONS);
  } catch (err) {
    if (input.method === "GIFT_CARD" || input.method === "PACKAGE") {
      // The instrument was already consumed; make the mismatch loud so staff
      // can reconcile it by hand.
      console.error(`[billing] ${input.method} consumed but payment not recorded for invoice ${input.invoiceId}`, err);
    }
    throw err;
  }
}
