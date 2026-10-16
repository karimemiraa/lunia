// Specialist commission (docs/PRD-commission-discounts-roles.md §3.1).
//
// Commission is earned on what the customer actually paid for her work:
//   • service & product lines on invoices that are PAID IN FULL, counted in the
//     month of the last payment (collected revenue), at the line's net
//     EXCLUDING VAT after the line discount and its share of the invoice
//     discount. The part of an invoice settled with a package session is left
//     out here — the session is counted below instead, never twice;
//   • package sessions used (PackageRedemption on a completed booking), at the
//     package price ÷ sessions (excl. VAT) — selling a package earns nothing;
//   • credit notes issued in the month take it back.
// Rates: a service's own rate if set, else her services %; products at her
// products %. Gift cards, memberships and other lines never earn commission.

import { prisma } from "@/lib/db";
import { centerLocalToUtc } from "@/modules/booking/availability";
import { computeInvoiceTotals, exclusiveOf } from "@/modules/billing/money";
import { getTaxSettings } from "@/modules/billing/settings";
import { monthBounds } from "./dates";

const BP = 10_000;

export type CommissionSource = "service" | "product" | "package" | "refund";

export interface CommissionLine {
  staffUserId: string;
  source: CommissionSource;
  at: Date;
  description: string;
  clientName: string | null;
  invoiceNumber: string | null;
  /** Amount the rate applies to, excl. VAT (negative for refunds). */
  baseMinor: number;
  rateBp: number;
  commissionMinor: number;
}

export interface StaffCommission {
  servicesBaseMinor: number;
  productsBaseMinor: number;
  commissionMinor: number;
  lines: CommissionLine[];
}

export interface Rates {
  servicesBp: number;
  productsBp: number;
}

/** round-half-away-from-zero of base × rate (works for refunds too). */
export function commissionOf(baseMinor: number, rateBp: number): number {
  const v = (Math.abs(baseMinor) * rateBp) / BP;
  return Math.sign(baseMinor) * Math.round(v);
}

interface StoredLine {
  kind: string;
  qty: number;
  unitPriceMinor: number;
  discountMinor: number;
  vatRateBp: number;
}

/**
 * Per-line commission base (excl. VAT) for one invoice: the line's taxable net
 * after its share of the invoice discount, scaled down by the share of the
 * invoice that was settled with package sessions.
 */
export function invoiceLineBases(lines: StoredLine[], invoiceDiscountMinor: number, packageShare = 0): number[] {
  const totals = computeInvoiceTotals(
    lines.map((l) => ({ qty: l.qty, unitPriceMinor: l.unitPriceMinor, discountMinor: l.discountMinor, vatRateBp: l.vatRateBp })),
    Math.min(invoiceDiscountMinor, lines.reduce((s, l) => s + l.unitPriceMinor * l.qty - l.discountMinor, 0)),
  );
  const keep = Math.max(0, Math.min(1, 1 - packageShare));
  return totals.lines.map((l) => Math.round(l.taxableMinor * keep));
}

/** Value of one package session for commission: price ÷ sessions, excl. VAT. */
export function packageSessionValue(priceMinor: number, sessionsTotal: number, pricesIncludeVat: boolean, vatRateBp: number): number {
  if (sessionsTotal <= 0) return 0;
  const perSession = Math.round(priceMinor / sessionsTotal);
  return pricesIncludeVat ? exclusiveOf(perSession, vatRateBp) : perSession;
}

const COMMISSION_KINDS = new Set(["SERVICE", "PRODUCT"]);

async function appointmentsByBooking(bookingIds: (string | null)[]): Promise<Map<string, { staffUserId: string; serviceId: string }[]>> {
  const ids = [...new Set(bookingIds.filter((x): x is string => !!x))];
  const rows = ids.length
    ? await prisma.appointment.findMany({ where: { bookingId: { in: ids } }, select: { bookingId: true, staffUserId: true, serviceId: true }, orderBy: { startAt: "asc" } })
    : [];
  const map = new Map<string, { staffUserId: string; serviceId: string }[]>();
  for (const r of rows) map.set(r.bookingId, [...(map.get(r.bookingId) ?? []), r]);
  return map;
}

/** Every commission line in [from, to), optionally for one staff member. */
export async function commissionLines(from: Date, to: Date, opts: { staffUserId?: string } = {}): Promise<CommissionLine[]> {
  const [records, tax] = await Promise.all([
    prisma.employeeRecord.findMany({ select: { userId: true, commissionBp: true, productCommissionBp: true } }),
    getTaxSettings(),
  ]);
  const rates = new Map(records.map((r) => [r.userId, { servicesBp: r.commissionBp, productsBp: r.productCommissionBp } satisfies Rates]));
  const services = new Map((await prisma.service.findMany({ select: { id: true, commissionBp: true } })).map((s) => [s.id, s.commissionBp]));
  const out: CommissionLine[] = [];
  const want = (staffUserId: string | null | undefined): staffUserId is string => !!staffUserId && (!opts.staffUserId || opts.staffUserId === staffUserId);
  const rateFor = (staffUserId: string, kind: string, serviceId: string | null) => {
    const r = rates.get(staffUserId) ?? { servicesBp: 0, productsBp: 0 };
    if (kind === "PRODUCT") return r.productsBp;
    return (serviceId ? services.get(serviceId) : null) ?? r.servicesBp;
  };

  // 1) Paid invoices whose last payment falls in the period.
  const paid = await prisma.invoice.findMany({
    where: { kind: "INVOICE", status: "PAID", payments: { some: { receivedAt: { gte: from, lt: to } } } },
    select: {
      number: true, discountMinor: true, customerName: true, totalMinor: true, bookingId: true,
      lines: { orderBy: { sortOrder: "asc" } },
      payments: { where: { status: { not: "FAILED" } }, select: { amountMinor: true, method: true, receivedAt: true } },
    },
  });
  const apptsByBooking = await appointmentsByBooking(paid.map((i) => i.bookingId));
  for (const inv of paid) {
    const lastPaidAt = inv.payments.reduce((d, p) => (p.receivedAt > d ? p.receivedAt : d), new Date(0));
    if (lastPaidAt < from || lastPaidAt >= to) continue;
    const totalPaid = inv.payments.reduce((s, p) => s + p.amountMinor, 0);
    const pkgPaid = inv.payments.filter((p) => p.method === "PACKAGE").reduce((s, p) => s + p.amountMinor, 0);
    const bases = invoiceLineBases(inv.lines, inv.discountMinor, totalPaid > 0 ? pkgPaid / totalPaid : 0);
    const appts = (inv.bookingId && apptsByBooking.get(inv.bookingId)) || [];
    inv.lines.forEach((l, i) => {
      if (!COMMISSION_KINDS.has(l.kind)) return;
      const staff = l.staffUserId ?? appts.find((a) => a.serviceId === l.serviceId)?.staffUserId ?? appts[0]?.staffUserId;
      if (!want(staff) || bases[i] === 0) return;
      const rateBp = rateFor(staff, l.kind, l.serviceId);
      out.push({
        staffUserId: staff, source: l.kind === "PRODUCT" ? "product" : "service", at: lastPaidAt, description: l.description,
        clientName: inv.customerName, invoiceNumber: inv.number, baseMinor: bases[i]!, rateBp, commissionMinor: commissionOf(bases[i]!, rateBp),
      });
    });
  }

  // 2) Package sessions used on completed visits.
  const redemptions = await prisma.packageRedemption.findMany({
    where: { createdAt: { gte: from, lt: to }, bookingId: { not: null } },
    select: { createdAt: true, bookingId: true, packagePurchase: { select: { package: { select: { nameEn: true, priceMinor: true, sessionsTotal: true, serviceId: true } } } } },
  });
  const bookings = new Map(
    (await prisma.booking.findMany({
      where: { id: { in: redemptions.map((r) => r.bookingId!) }, status: "COMPLETED" },
      select: { id: true, client: { select: { fullName: true } }, appointments: { select: { staffUserId: true, serviceId: true }, orderBy: { startAt: "asc" } } },
    })).map((b) => [b.id, b]),
  );
  for (const r of redemptions) {
    const b = bookings.get(r.bookingId!);
    if (!b) continue;
    const pkg = r.packagePurchase.package;
    const appt = b.appointments.find((a) => a.serviceId === pkg.serviceId) ?? b.appointments[0];
    if (!appt || !want(appt.staffUserId)) continue;
    const base = packageSessionValue(pkg.priceMinor, pkg.sessionsTotal, tax.pricesIncludeVat, tax.defaultVatRateBp);
    const rateBp = rateFor(appt.staffUserId, "SERVICE", appt.serviceId);
    out.push({
      staffUserId: appt.staffUserId, source: "package", at: r.createdAt, description: pkg.nameEn, clientName: b.client.fullName,
      invoiceNumber: null, baseMinor: base, rateBp, commissionMinor: commissionOf(base, rateBp),
    });
  }

  // 3) Credit notes issued in the period take it back.
  const credits = await prisma.invoice.findMany({
    where: { kind: "CREDIT_NOTE", status: { not: "VOID" }, issuedAt: { gte: from, lt: to } },
    select: { number: true, issuedAt: true, discountMinor: true, customerName: true, originalInvoiceId: true, lines: { orderBy: { sortOrder: "asc" } } },
  });
  const originals = new Map(
    (await prisma.invoice.findMany({
      where: { id: { in: credits.map((c) => c.originalInvoiceId).filter((x): x is string => !!x) } },
      select: { id: true, bookingId: true, lines: { select: { serviceId: true, productId: true, staffUserId: true } } },
    })).map((o) => [o.id, o]),
  );
  const origAppts = await appointmentsByBooking([...originals.values()].map((o) => o.bookingId));
  for (const cn of credits) {
    const orig = cn.originalInvoiceId ? originals.get(cn.originalInvoiceId) : undefined;
    const bases = invoiceLineBases(cn.lines, cn.discountMinor);
    cn.lines.forEach((l, i) => {
      if (!COMMISSION_KINDS.has(l.kind)) return;
      const match = orig?.lines.find((o) => (l.serviceId && o.serviceId === l.serviceId) || (l.productId && o.productId === l.productId));
      const staff = l.staffUserId ?? match?.staffUserId ?? ((orig?.bookingId && origAppts.get(orig.bookingId)) || [])[0]?.staffUserId;
      if (!want(staff) || bases[i] === 0) return;
      const rateBp = rateFor(staff, l.kind, l.serviceId);
      const base = -Math.abs(bases[i]!);
      out.push({
        staffUserId: staff, source: "refund", at: cn.issuedAt!, description: l.description, clientName: cn.customerName,
        invoiceNumber: cn.number, baseMinor: base, rateBp, commissionMinor: commissionOf(base, rateBp),
      });
    });
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function summarize(lines: CommissionLine[]): Map<string, StaffCommission> {
  const map = new Map<string, StaffCommission>();
  for (const l of lines) {
    const s = map.get(l.staffUserId) ?? { servicesBaseMinor: 0, productsBaseMinor: 0, commissionMinor: 0, lines: [] };
    if (l.source === "product") s.productsBaseMinor += l.baseMinor;
    else s.servicesBaseMinor += l.baseMinor;
    s.commissionMinor += l.commissionMinor;
    s.lines.push(l);
    map.set(l.staffUserId, s);
  }
  return map;
}

/** [from, to) UTC bounds of a center-local month "YYYY-MM". */
export function monthRange(month: string): { from: Date; to: Date } {
  const { firstISO, lastISO } = monthBounds(month);
  return { from: centerLocalToUtc(firstISO, 0), to: centerLocalToUtc(lastISO, 1440) };
}

/** Commission per staff member for a center-local month (payroll). */
export async function commissionByStaff(month: string): Promise<Map<string, StaffCommission>> {
  const { from, to } = monthRange(month);
  return summarize(await commissionLines(from, to));
}
