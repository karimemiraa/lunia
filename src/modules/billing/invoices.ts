// Front-desk VAT invoices: drafts, issuing (numbering + ZATCA Phase 1 QR +
// Phase 2-ready XML/hash chain + stock), voiding drafts, and credit notes.
//
// Lifecycle: DRAFT (editable, placeholder number) → ISSUED (immutable) →
// PARTIALLY_PAID / PAID as payments land (settlement.ts). Only drafts can be
// VOIDed; an issued invoice is corrected exclusively by a credit note.
//
// Credit notes are Invoice rows with kind CREDIT_NOTE, POSITIVE amounts (as
// in UBL 381) and originalInvoiceId set; reports must subtract them. A credit
// note is settled on issue (status PAID): the credited amount either reduces
// what is still owed on the original or is refunded (a negative Payment on
// the credit note). Each credit-note line keeps the sortOrder of the original
// line it credits — that is how remaining creditable quantities are tracked
// without an extra column.

import { randomUUID } from "crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { Invoice, InvoiceLine, PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordStockMovement } from "@/modules/inventory/stock";
import {
  computeInvoiceTotals,
  computeLine,
  invoiceDiscountFromInclusive,
  lineFromInclusive,
  toDecimal,
  type InvoiceTotals,
  type LineAmounts,
} from "./money";
import { getTaxSettings, sellerLegalName, taxSettingsIssues, type TaxSettings } from "./settings";
import { zatcaQrBase64, zatcaTimestamp } from "./zatca/tlv";
import { INITIAL_PIH, buildUblXml, invoiceHash, withXmlDeclaration, type UblGroup } from "./zatca/ubl";
import { lockInvoice, openCashSessionId, settleInvoice } from "./settlement";
import { BillingError, InsufficientStockError } from "./errors";

type Tx = Prisma.TransactionClient;

export const LINE_KINDS = ["SERVICE", "PRODUCT", "PACKAGE", "GIFT_CARD", "OTHER"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export const WALK_IN_NAME = "Walk-in customer";

// One global advisory lock serializes issuing: invoice numbers must be
// gap-free per series and the ZATCA ICV counter / PIH hash chain is a single
// sequence across invoices AND credit notes. A clinic issues a handful of
// documents per minute, so a single lock costs nothing.
const ISSUE_LOCK_KEY = 0x4c554e49; // "LUNI"
const TX_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;

export { BillingError, InsufficientStockError };

// --- Drafts --------------------------------------------------------------------

const draftLineSchema = z.object({
  kind: z.enum(LINE_KINDS),
  serviceId: z.string().min(1).optional().nullable(),
  productId: z.string().min(1).optional().nullable(),
  description: z.string().trim().min(1).max(300),
  qty: z.number().int().positive().max(10_000),
  /** As entered: VAT-inclusive when pricesIncludeVat, else exclusive. */
  unitPriceMinor: z.number().int().nonnegative().max(1_000_000_000),
  discountMinor: z.number().int().nonnegative().default(0),
  vatRateBp: z.number().int().min(0).max(10_000),
});
export type DraftLineInput = z.input<typeof draftLineSchema>;

const draftSchema = z.object({
  clientProfileId: z.string().min(1).optional().nullable(),
  bookingId: z.string().min(1).optional().nullable(),
  customerName: z.string().trim().max(200).optional(),
  customerPhone: z.string().trim().max(40).optional().nullable(),
  customerVatNumber: z
    .string()
    .trim()
    .regex(/^(3\d{13}3)?$/, "Customer VAT number must be 15 digits starting and ending with 3")
    .optional()
    .nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  pricesIncludeVat: z.boolean(),
  lines: z.array(draftLineSchema).max(200),
  /** As entered (inclusive/exclusive like the lines). */
  invoiceDiscountMinor: z.number().int().nonnegative().default(0),
});
export type DraftInput = z.input<typeof draftSchema>;

interface NormalizedDraft {
  lines: (Omit<Prisma.InvoiceLineCreateManyInvoiceInput, "invoiceId"> & LineAmounts & { vatMinor: number; totalMinor: number })[];
  totals: InvoiceTotals;
}

// Converts entered amounts to the stored (VAT-exclusive) representation and
// computes every total server-side — the client preview is never trusted.
export function normalizeDraft(input: z.output<typeof draftSchema>): NormalizedDraft {
  const amounts: LineAmounts[] = input.lines.map((l) => {
    if (!input.pricesIncludeVat) {
      return { qty: l.qty, unitPriceMinor: l.unitPriceMinor, discountMinor: l.discountMinor, vatRateBp: l.vatRateBp };
    }
    const conv = lineFromInclusive({
      unitInclMinor: l.unitPriceMinor,
      qty: l.qty,
      discountInclMinor: l.discountMinor,
      vatRateBp: l.vatRateBp,
    });
    return { qty: l.qty, vatRateBp: l.vatRateBp, ...conv };
  });
  const invoiceDiscount = input.pricesIncludeVat
    ? invoiceDiscountFromInclusive(amounts, input.invoiceDiscountMinor)
    : input.invoiceDiscountMinor;
  const totals = computeInvoiceTotals(amounts, invoiceDiscount);
  const lines = input.lines.map((l, i) => {
    const a = amounts[i]!;
    const c = totals.lines[i]!;
    return {
      ...a,
      kind: l.kind,
      serviceId: l.kind === "SERVICE" ? (l.serviceId ?? null) : null,
      productId: l.kind === "PRODUCT" ? (l.productId ?? null) : null,
      description: l.description,
      vatMinor: c.vatMinor,
      totalMinor: c.totalMinor,
      sortOrder: i,
    };
  });
  return { lines, totals };
}

function lineRows(n: NormalizedDraft) {
  return n.lines.map((l) => ({
    kind: l.kind,
    serviceId: l.serviceId,
    productId: l.productId,
    description: l.description,
    qty: l.qty,
    unitPriceMinor: l.unitPriceMinor,
    discountMinor: l.discountMinor,
    vatRateBp: l.vatRateBp,
    vatMinor: l.vatMinor,
    totalMinor: l.totalMinor,
    sortOrder: l.sortOrder,
  }));
}

function totalsData(t: InvoiceTotals) {
  return { subtotalMinor: t.subtotalMinor, discountMinor: t.discountMinor, vatMinor: t.vatMinor, totalMinor: t.totalMinor };
}

function draftNumber(): string {
  return `DRAFT-${randomUUID()}`;
}

export async function createDraft(raw: DraftInput, actorId?: string): Promise<Invoice> {
  const input = draftSchema.parse(raw);
  const n = normalizeDraft(input);
  const settings = await getTaxSettings();
  return prisma.invoice.create({
    data: {
      number: draftNumber(),
      kind: "INVOICE",
      clientProfileId: input.clientProfileId ?? null,
      bookingId: input.bookingId ?? null,
      customerName: input.customerName?.trim() || WALK_IN_NAME,
      customerPhone: input.customerPhone || null,
      customerVatNumber: input.customerVatNumber || null,
      notes: input.notes || null,
      vatRateBp: settings.defaultVatRateBp,
      createdById: actorId ?? null,
      ...totalsData(n.totals),
      lines: { create: lineRows(n) },
    },
  });
}

export async function updateDraft(invoiceId: string, raw: DraftInput): Promise<Invoice> {
  const input = draftSchema.parse(raw);
  const n = normalizeDraft(input);
  return prisma.$transaction(async (tx) => {
    const inv = await lockInvoice(tx, invoiceId);
    if (inv.status !== "DRAFT") throw new BillingError("Only draft invoices can be edited");
    await tx.invoiceLine.deleteMany({ where: { invoiceId } });
    return tx.invoice.update({
      where: { id: invoiceId },
      data: {
        clientProfileId: input.clientProfileId ?? null,
        bookingId: input.bookingId ?? null,
        customerName: input.customerName?.trim() || WALK_IN_NAME,
        customerPhone: input.customerPhone || null,
        customerVatNumber: input.customerVatNumber || null,
        notes: input.notes || null,
        ...totalsData(n.totals),
        lines: { create: lineRows(n) },
      },
    });
  }, TX_OPTIONS);
}

// A draft pre-filled from a booking: one SERVICE line per appointment at its
// price snapshot, the booking's (loyalty) discount as the invoice discount,
// customer + booking linked. Returns the existing invoice instead when the
// booking already has a non-void one, so "Checkout" is safe to click twice.
export async function createDraftFromBooking(bookingId: string, actorId?: string): Promise<Invoice> {
  const existing = await prisma.invoice.findFirst({
    where: { bookingId, kind: "INVOICE", status: { not: "VOID" } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      appointments: { include: { service: true }, orderBy: { startAt: "asc" } },
      client: { include: { user: { select: { phone: true } } } },
    },
  });
  if (!booking) throw new BillingError("Booking not found");
  const settings = await getTaxSettings();

  return createDraft(
    {
      clientProfileId: booking.clientProfileId,
      bookingId: booking.id,
      customerName: booking.client.fullName,
      customerPhone: booking.client.user.phone,
      pricesIncludeVat: settings.pricesIncludeVat,
      lines: booking.appointments.map((a) => ({
        kind: "SERVICE" as const,
        serviceId: a.serviceId,
        description: a.service.nameEn,
        qty: 1,
        unitPriceMinor: a.priceMinorSnapshot,
        discountMinor: 0,
        vatRateBp: settings.defaultVatRateBp,
      })),
      invoiceDiscountMinor: Math.min(
        booking.discountMinor,
        booking.appointments.reduce((s, a) => s + a.priceMinorSnapshot, 0),
      ),
    },
    actorId,
  );
}

export async function voidDraft(invoiceId: string): Promise<Invoice> {
  const res = await prisma.invoice.updateMany({ where: { id: invoiceId, status: "DRAFT" }, data: { status: "VOID" } });
  if (res.count !== 1) throw new BillingError("Only draft invoices can be voided — correct an issued invoice with a credit note");
  return prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
}

// --- Issuing -----------------------------------------------------------------

async function acquireIssueLock(tx: Tx): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${ISSUE_LOCK_KEY}::bigint)::text AS locked`;
}

function riyadhYear(d: Date): number {
  return new Date(d.getTime() + 3 * 3_600_000).getUTCFullYear();
}

// Next gap-free number in a series ("INV-2026-000042"). Must run under the
// issue lock; numbers are only ever assigned inside the issuing transaction,
// so a rolled-back issue never burns one.
export async function nextDocumentNumber(tx: Tx, prefix: string, year: number): Promise<string> {
  const series = `${prefix}-${year}-`;
  const last = await tx.invoice.findFirst({
    where: { number: { startsWith: series } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const seq = last ? Number(last.number.slice(series.length)) + 1 : 1;
  return `${series}${String(seq).padStart(6, "0")}`;
}

function storedLineAmounts(lines: InvoiceLine[]): LineAmounts[] {
  // The stored total pins each line (it may come from VAT-inclusive pricing).
  return lines.map((l) => ({
    qty: l.qty,
    unitPriceMinor: l.unitPriceMinor,
    discountMinor: l.discountMinor,
    vatRateBp: l.vatRateBp,
    grossMinor: l.totalMinor,
  }));
}

function ublGroups(lines: LineAmounts[], totals: InvoiceTotals): UblGroup[] {
  return totals.groups.map((g) => ({
    ...g,
    allowanceMinor: totals.lines.reduce(
      (s, l, i) => (lines[i]!.vatRateBp === g.vatRateBp ? s + l.invoiceDiscountShareMinor : s),
      0,
    ),
  }));
}

interface StampInput {
  kind: "INVOICE" | "CREDIT_NOTE";
  number: string;
  issuedAt: Date;
  settings: TaxSettings;
  lines: InvoiceLine[];
  totals: InvoiceTotals;
  customerName: string;
  customerVatNumber: string | null;
  billingReference?: string;
  creditReason?: string;
}

// ZATCA fields for a document being issued: UUID, next ICV, PIH (hash of the
// previous document), Phase 1 QR, UBL XML and this document's hash.
async function zatcaStamp(tx: Tx, s: StampInput) {
  const agg = await tx.invoice.aggregate({ _max: { zatcaCounter: true } });
  const counter = (agg._max.zatcaCounter ?? 0) + 1;
  const prev = await tx.invoice.findFirst({
    where: { zatcaCounter: { not: null } },
    orderBy: { zatcaCounter: "desc" },
    select: { zatcaHash: true },
  });
  const previousHash = prev?.zatcaHash ?? INITIAL_PIH;
  const uuid = randomUUID();
  const amounts = storedLineAmounts(s.lines);

  const body = buildUblXml({
    kind: s.kind,
    number: s.number,
    uuid,
    issuedAt: s.issuedAt,
    counter,
    previousHash,
    seller: s.settings,
    buyer: { name: s.customerName, vatNumber: s.customerVatNumber },
    lines: s.lines.map((l, i) => ({
      description: l.description,
      qty: l.qty,
      unitPriceMinor: l.unitPriceMinor,
      discountMinor: l.discountMinor,
      vatRateBp: l.vatRateBp,
      netMinor: s.totals.lines[i]!.netMinor,
      vatMinor: l.vatMinor,
      totalMinor: l.totalMinor,
    })),
    groups: ublGroups(amounts, s.totals),
    subtotalMinor: s.totals.subtotalMinor,
    discountMinor: s.totals.discountMinor,
    vatMinor: s.totals.vatMinor,
    totalMinor: s.totals.totalMinor,
    billingReference: s.billingReference,
    creditReason: s.creditReason,
  });

  return {
    zatcaUuid: uuid,
    zatcaCounter: counter,
    zatcaPrevHash: previousHash,
    zatcaHash: invoiceHash(body),
    zatcaXml: withXmlDeclaration(body),
    zatcaQr: zatcaQrBase64({
      sellerName: sellerLegalName(s.settings),
      vatNumber: s.settings.vatNumber,
      timestamp: zatcaTimestamp(s.issuedAt),
      totalWithVat: toDecimal(s.totals.totalMinor),
      vatTotal: toDecimal(s.totals.vatMinor),
    }),
    zatcaStatus: "NOT_SUBMITTED",
  };
}

function assertSettingsReady(settings: TaxSettings): void {
  const issues = taxSettingsIssues(settings);
  if (issues.length) throw new BillingError(`Complete the tax settings before issuing: ${issues.join(", ")}`);
}

export interface IssueOptions {
  actorId?: string;
  /** Issue even if a product line would take stock below zero. */
  allowNegativeStock?: boolean;
  now?: Date;
}

export async function issueInvoice(invoiceId: string, opts: IssueOptions = {}): Promise<Invoice> {
  const settings = await getTaxSettings();
  assertSettingsReady(settings);

  return prisma.$transaction(async (tx) => {
    await acquireIssueLock(tx);
    const inv = await lockInvoice(tx, invoiceId);
    if (inv.kind !== "INVOICE") throw new BillingError("Credit notes are issued via createCreditNote");
    if (inv.status !== "DRAFT") throw new BillingError("This invoice has already been issued or voided");
    const lines = await tx.invoiceLine.findMany({ where: { invoiceId }, orderBy: { sortOrder: "asc" } });
    if (lines.length === 0) throw new BillingError("Add at least one line before issuing");

    // Recompute from the stored lines — the authoritative amounts.
    const totals = computeInvoiceTotals(storedLineAmounts(lines), inv.discountMinor);

    // Stock check for product lines (aggregated per product).
    const wanted = new Map<string, number>();
    for (const l of lines) if (l.kind === "PRODUCT" && l.productId) wanted.set(l.productId, (wanted.get(l.productId) ?? 0) + l.qty);
    const products = wanted.size ? await tx.product.findMany({ where: { id: { in: [...wanted.keys()] } } }) : [];
    const byId = new Map(products.map((p) => [p.id, p]));
    if (wanted.size > 0) {
      const shortages = [...wanted.entries()]
        .map(([productId, requested]) => {
          const p = byId.get(productId);
          return { productId, name: p?.nameEn ?? "Unknown product", available: p?.stockQty ?? 0, requested };
        })
        .filter((s) => s.available < s.requested);
      if (shortages.length && !opts.allowNegativeStock) throw new InsufficientStockError(shortages);
    }

    const issuedAt = opts.now ?? new Date();
    const number = await nextDocumentNumber(tx, settings.invoicePrefix, riyadhYear(issuedAt));
    const zatca = await zatcaStamp(tx, {
      kind: "INVOICE",
      number,
      issuedAt,
      settings,
      lines,
      totals,
      customerName: inv.customerName,
      customerVatNumber: inv.customerVatNumber,
    });

    await tx.invoice.update({
      where: { id: invoiceId },
      data: { number, issuedAt, status: "ISSUED", vatRateBp: settings.defaultVatRateBp, ...totalsData(totals), ...zatca },
    });

    for (const [productId, qty] of wanted) {
      await recordStockMovement(
        {
          productId,
          qty: -qty,
          type: "SALE",
          refType: "INVOICE",
          refId: invoiceId,
          unitCostMinor: byId.get(productId)?.costMinor,
          createdById: opts.actorId,
          note: number,
        },
        tx,
      );
    }

    return settleInvoice(tx, invoiceId);
  }, TX_OPTIONS);
}

// --- Credit notes ------------------------------------------------------------

const creditNoteSchema = z.object({
  originalInvoiceId: z.string().min(1),
  /** Omit for a full credit of everything not yet credited. */
  lines: z.array(z.object({ sortOrder: z.number().int().nonnegative(), qty: z.number().int().positive() })).optional(),
  reason: z.string().trim().min(3).max(500),
  refund: z
    .object({
      method: z.enum(["CASH", "CARD", "MADA", "APPLE_PAY", "BANK_TRANSFER", "ONLINE", "OTHER"]),
      amountMinor: z.number().int().positive(),
      reference: z.string().trim().max(200).optional(),
    })
    .optional(),
  /** Put returned products back into stock (default true). */
  restock: z.boolean().default(true),
});
export type CreditNoteInput = z.input<typeof creditNoteSchema>;

/** Per original line (by sortOrder): qty and discount already credited. */
async function creditedSoFar(tx: Tx | typeof prisma, originalId: string) {
  const cnLines = await tx.invoiceLine.findMany({
    where: { invoice: { originalInvoiceId: originalId, kind: "CREDIT_NOTE", status: { not: "VOID" } } },
    select: { sortOrder: true, qty: true, discountMinor: true, totalMinor: true },
  });
  const map = new Map<number, { qty: number; discountMinor: number }>();
  for (const l of cnLines) {
    const cur = map.get(l.sortOrder) ?? { qty: 0, discountMinor: 0 };
    map.set(l.sortOrder, { qty: cur.qty + l.qty, discountMinor: cur.discountMinor + l.discountMinor });
  }
  return map;
}

export async function creditableLines(originalId: string) {
  const [lines, credited] = await Promise.all([
    prisma.invoiceLine.findMany({ where: { invoiceId: originalId }, orderBy: { sortOrder: "asc" } }),
    creditedSoFar(prisma, originalId),
  ]);
  return lines.map((l) => ({ ...l, remainingQty: l.qty - (credited.get(l.sortOrder)?.qty ?? 0) }));
}

export async function createCreditNote(raw: CreditNoteInput, opts: { actorId?: string; now?: Date } = {}): Promise<Invoice> {
  const input = creditNoteSchema.parse(raw);
  const settings = await getTaxSettings();
  assertSettingsReady(settings);

  return prisma.$transaction(async (tx) => {
    await acquireIssueLock(tx);
    const original = await lockInvoice(tx, input.originalInvoiceId);
    if (original.kind !== "INVOICE") throw new BillingError("A credit note must reference an invoice");
    if (!["ISSUED", "PARTIALLY_PAID", "PAID"].includes(original.status)) {
      throw new BillingError("Only issued invoices can be credited");
    }
    const origLines = await tx.invoiceLine.findMany({ where: { invoiceId: original.id }, orderBy: { sortOrder: "asc" } });
    const credited = await creditedSoFar(tx, original.id);

    const requested =
      input.lines ??
      origLines
        .map((l) => ({ sortOrder: l.sortOrder, qty: l.qty - (credited.get(l.sortOrder)?.qty ?? 0) }))
        .filter((l) => l.qty > 0);
    if (requested.length === 0) throw new BillingError("Nothing left to credit on this invoice");

    // Build the credit-note lines: same prices, pro-rated line discount (the
    // last credit of a line takes whatever discount is left, so the parts
    // always add back up to the original).
    const cnLines = requested.map((r) => {
      const o = origLines.find((l) => l.sortOrder === r.sortOrder);
      if (!o) throw new BillingError("Unknown invoice line");
      const done = credited.get(o.sortOrder) ?? { qty: 0, discountMinor: 0 };
      const remaining = o.qty - done.qty;
      if (r.qty > remaining) throw new BillingError(`Only ${remaining} × "${o.description}" left to credit`);
      const isLast = r.qty === remaining;
      const discountMinor = isLast
        ? o.discountMinor - done.discountMinor
        : Math.round((o.discountMinor * r.qty) / o.qty);
      const pinned = isLast && done.qty === 0; // a whole line credited at once keeps its exact total
      const amounts: LineAmounts = {
        qty: r.qty,
        unitPriceMinor: o.unitPriceMinor,
        discountMinor,
        vatRateBp: o.vatRateBp,
        grossMinor: pinned ? o.totalMinor : undefined,
      };
      const c = computeLine(amounts);
      return { o, amounts, c };
    });

    // Invoice-level discount, pro rata to the credited net (full credit → all of it).
    const origSubtotal = original.subtotalMinor;
    const creditedNet = cnLines.reduce((s, l) => s + l.c.netMinor, 0);
    const prevCredits = await tx.invoice.aggregate({
      where: { originalInvoiceId: original.id, kind: "CREDIT_NOTE", status: { not: "VOID" } },
      _sum: { discountMinor: true, totalMinor: true, subtotalMinor: true },
    });
    const discountLeft = original.discountMinor - (prevCredits._sum.discountMinor ?? 0);
    const netLeft = origSubtotal - (prevCredits._sum.subtotalMinor ?? 0);
    const cnDiscount =
      creditedNet >= netLeft ? discountLeft : Math.min(discountLeft, Math.round((original.discountMinor * creditedNet) / origSubtotal));

    const amounts = cnLines.map((l) => l.amounts);
    const totals = computeInvoiceTotals(amounts, Math.max(0, cnDiscount));
    const creditableLeft = original.totalMinor - (prevCredits._sum.totalMinor ?? 0);
    if (totals.totalMinor > creditableLeft + cnLines.length) {
      throw new BillingError("Credit exceeds what is left on the invoice");
    }

    const issuedAt = opts.now ?? new Date();
    const number = await nextDocumentNumber(tx, settings.creditNotePrefix, riyadhYear(issuedAt));
    const cn = await tx.invoice.create({
      data: {
        number,
        kind: "CREDIT_NOTE",
        originalInvoiceId: original.id,
        clientProfileId: original.clientProfileId,
        bookingId: original.bookingId,
        customerName: original.customerName,
        customerPhone: original.customerPhone,
        customerVatNumber: original.customerVatNumber,
        status: "PAID",
        issuedAt,
        notes: input.reason,
        vatRateBp: original.vatRateBp,
        createdById: opts.actorId ?? null,
        ...totalsData(totals),
        lines: {
          create: cnLines.map((l, i) => ({
            kind: l.o.kind,
            serviceId: l.o.serviceId,
            productId: l.o.productId,
            description: l.o.description,
            qty: l.amounts.qty,
            unitPriceMinor: l.amounts.unitPriceMinor,
            discountMinor: l.amounts.discountMinor,
            vatRateBp: l.amounts.vatRateBp,
            vatMinor: totals.lines[i]!.vatMinor,
            totalMinor: totals.lines[i]!.totalMinor,
            sortOrder: l.o.sortOrder,
          })),
        },
      },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });

    const zatca = await zatcaStamp(tx, {
      kind: "CREDIT_NOTE",
      number,
      issuedAt,
      settings,
      lines: cn.lines,
      totals,
      customerName: cn.customerName,
      customerVatNumber: cn.customerVatNumber,
      billingReference: original.number,
      creditReason: input.reason,
    });
    await tx.invoice.update({ where: { id: cn.id }, data: zatca });

    if (input.restock) {
      const returned = cn.lines.filter((l) => l.kind === "PRODUCT" && l.productId);
      const costs = new Map(
        (await tx.product.findMany({ where: { id: { in: returned.map((l) => l.productId!) } }, select: { id: true, costMinor: true } })).map(
          (p) => [p.id, p.costMinor],
        ),
      );
      for (const l of returned) {
        await recordStockMovement(
          {
            productId: l.productId!,
            qty: l.qty,
            type: "RETURN",
            refType: "INVOICE",
            refId: cn.id,
            unitCostMinor: costs.get(l.productId!),
            createdById: opts.actorId,
            note: number,
          },
          tx,
        );
      }
    }

    if (input.refund) {
      // Can't refund more than was actually collected (net of earlier refunds).
      const origPaid = await tx.payment.aggregate({ where: { invoiceId: original.id, status: "COMPLETED" }, _sum: { amountMinor: true } });
      const prevRefunds = await tx.payment.aggregate({
        where: { invoice: { originalInvoiceId: original.id }, status: "COMPLETED" },
        _sum: { amountMinor: true },
      });
      const refundable = Math.min(totals.totalMinor, (origPaid._sum.amountMinor ?? 0) + (prevRefunds._sum.amountMinor ?? 0));
      if (input.refund.amountMinor > refundable) {
        throw new BillingError(`Refund exceeds the refundable amount (${toDecimal(refundable)} SAR)`);
      }
      await tx.payment.create({
        data: {
          invoiceId: cn.id,
          method: input.refund.method as PaymentMethod,
          amountMinor: -input.refund.amountMinor,
          reference: input.refund.reference ?? null,
          receivedById: opts.actorId ?? null,
          cashSessionId: input.refund.method === "CASH" ? await openCashSessionId(tx) : null,
          note: `Refund for ${original.number}`,
        },
      });
      await tx.invoice.update({ where: { id: cn.id }, data: { paidMinor: input.refund.amountMinor } });
    }

    await settleInvoice(tx, original.id);
    return tx.invoice.findUniqueOrThrow({ where: { id: cn.id } });
  }, TX_OPTIONS);
}

// --- Read side ---------------------------------------------------------------

export interface ListInvoicesFilter {
  status?: Invoice["status"];
  kind?: "INVOICE" | "CREDIT_NOTE";
  from?: Date;
  to?: Date;
  q?: string;
  clientProfileId?: string;
  take?: number;
}

export function invoiceWhere(f: ListInvoicesFilter): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = {};
  if (f.status) where.status = f.status;
  if (f.kind) where.kind = f.kind;
  if (f.clientProfileId) where.clientProfileId = f.clientProfileId;
  if (f.from || f.to) {
    // Drafts have no issuedAt; filter them by creation time instead.
    const range = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) };
    where.OR = [{ issuedAt: range }, { issuedAt: null, createdAt: range }];
  }
  const q = f.q?.trim();
  if (q) {
    where.AND = [
      {
        OR: [
          { number: { contains: q, mode: "insensitive" } },
          { customerName: { contains: q, mode: "insensitive" } },
          { customerPhone: { contains: q } },
        ],
      },
    ];
  }
  return where;
}

export async function listInvoices(f: ListInvoicesFilter = {}) {
  const where = invoiceWhere(f);
  const [rows, sums] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ issuedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
      take: Math.min(f.take ?? 200, 500),
      select: {
        id: true,
        number: true,
        kind: true,
        status: true,
        customerName: true,
        customerPhone: true,
        clientProfileId: true,
        issuedAt: true,
        createdAt: true,
        totalMinor: true,
        vatMinor: true,
        paidMinor: true,
        originalInvoiceId: true,
      },
    }),
    // Totals row: issued documents only (credit notes subtract).
    prisma.invoice.groupBy({
      by: ["kind"],
      where: { AND: [where, { status: { notIn: ["DRAFT", "VOID"] } }] },
      _sum: { totalMinor: true, vatMinor: true, paidMinor: true },
    }),
  ]);
  const sum = (kind: string, k: "totalMinor" | "vatMinor" | "paidMinor") => sums.find((s) => s.kind === kind)?._sum[k] ?? 0;
  return {
    rows,
    totals: {
      totalMinor: sum("INVOICE", "totalMinor") - sum("CREDIT_NOTE", "totalMinor"),
      vatMinor: sum("INVOICE", "vatMinor") - sum("CREDIT_NOTE", "vatMinor"),
      // Invoice paidMinor is already net of credit-note refunds.
      paidMinor: sum("INVOICE", "paidMinor"),
    },
  };
}

export async function getInvoiceDetail(id: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { receivedAt: "asc" } },
      paymentLinks: { orderBy: { createdAt: "desc" } },
      client: { select: { id: true, fullName: true, user: { select: { phone: true, email: true, locale: true } } } },
    },
  });
  if (!invoice) return null;
  const [creditNotes, original] = await Promise.all([
    prisma.invoice.findMany({
      where: { originalInvoiceId: id, kind: "CREDIT_NOTE" },
      orderBy: { issuedAt: "asc" },
      include: { payments: true },
    }),
    invoice.originalInvoiceId
      ? prisma.invoice.findUnique({ where: { id: invoice.originalInvoiceId }, select: { id: true, number: true, issuedAt: true } })
      : Promise.resolve(null),
  ]);
  return { invoice, creditNotes, original };
}

/** Issued invoices still (partly) unpaid for more than `days` days. */
export async function listOverdueUnpaid(days = 3, take = 5) {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const where: Prisma.InvoiceWhereInput = {
    kind: "INVOICE",
    status: { in: ["ISSUED", "PARTIALLY_PAID"] },
    issuedAt: { lt: cutoff },
  };
  const [count, items] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({ where, orderBy: { issuedAt: "asc" }, take }),
  ]);
  return { count, items };
}
