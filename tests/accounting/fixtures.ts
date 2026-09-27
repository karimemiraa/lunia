// Shared fixtures for the accounting suites: sample invoices/credit notes,
// payments, expenses and a staff user. Everything is tagged with a per-run
// prefix and removed in cleanup(); report assertions use date ranges in 2031
// that no other suite writes to.

import { prisma } from "@/lib/db";
import { centerLocalToUtc } from "@/modules/booking/availability";

export function makeTag(name: string): string {
  return `TACC-${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

let counter = 0;

export interface InvoiceLineFixture {
  kind?: string;
  serviceId?: string;
  productId?: string;
  description?: string;
  qty?: number;
  netMinor: number;
  vatMinor?: number;
}

/** Creates an issued invoice (or credit note) at noon center-local on `dateISO`. */
export async function makeInvoice(
  tag: string,
  opts: {
    dateISO: string;
    kind?: "INVOICE" | "CREDIT_NOTE";
    status?: "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOID";
    lines: InvoiceLineFixture[];
    paidMinor?: number;
    originalInvoiceId?: string;
    /** Store credit-note amounts as negatives (billing may choose either sign). */
    negative?: boolean;
    bookingId?: string;
  },
) {
  counter += 1;
  const sign = opts.negative ? -1 : 1;
  const lines = opts.lines.map((l, i) => {
    const vat = l.vatMinor ?? Math.round((l.netMinor * 15) / 100);
    return {
      kind: l.kind ?? "SERVICE",
      serviceId: l.serviceId ?? null,
      productId: l.productId ?? null,
      description: l.description ?? `Line ${i + 1}`,
      qty: l.qty ?? 1,
      unitPriceMinor: l.netMinor,
      vatRateBp: vat === 0 ? 0 : 1500,
      vatMinor: sign * vat,
      totalMinor: sign * (l.netMinor + vat),
      sortOrder: i,
    };
  });
  const subtotal = lines.reduce((s, l) => s + (l.totalMinor - l.vatMinor), 0);
  const vat = lines.reduce((s, l) => s + l.vatMinor, 0);
  return prisma.invoice.create({
    data: {
      number: `${tag}-${counter}`,
      kind: opts.kind ?? "INVOICE",
      originalInvoiceId: opts.originalInvoiceId ?? null,
      customerName: `${tag} customer`,
      status: opts.status ?? "ISSUED",
      issuedAt: centerLocalToUtc(opts.dateISO, 720),
      subtotalMinor: subtotal,
      vatMinor: vat,
      totalMinor: subtotal + vat,
      paidMinor: opts.paidMinor ?? 0,
      bookingId: opts.bookingId ?? null,
      lines: { create: lines },
    },
  });
}

export async function makeExpense(tag: string, opts: { dateISO: string; amountMinor: number; vatMinor: number; categoryId?: string | null }) {
  return prisma.expense.create({
    data: {
      description: `${tag} expense`,
      vendor: tag,
      amountMinor: opts.amountMinor,
      vatMinor: opts.vatMinor,
      paidAt: centerLocalToUtc(opts.dateISO, 720),
      categoryId: opts.categoryId ?? null,
    },
  });
}

export async function cleanup(tag: string): Promise<void> {
  await prisma.payment.deleteMany({ where: { OR: [{ reference: { startsWith: tag } }, { invoice: { number: { startsWith: tag } } }] } });
  await prisma.invoice.deleteMany({ where: { number: { startsWith: tag } } });
  await prisma.expense.deleteMany({ where: { vendor: tag } });
}
