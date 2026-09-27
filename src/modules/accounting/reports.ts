// Read-only accounting reports: dashboard summary, profit & loss by month,
// VAT return summary, receivables aging and sales analysis. Invoices and
// payments are owned by the billing module; this file only reads them.
//
// Conventions (shared by every report here):
// - An invoice counts once it is issued: status ISSUED / PARTIALLY_PAID /
//   PAID, bucketed by `issuedAt` (center-local). DRAFT and VOID never count.
// - Credit notes (kind CREDIT_NOTE) reduce revenue and output VAT in the
//   period they are issued. Amounts are read with Math.abs and negated, so
//   this works whether billing stores credit-note totals as positive or
//   negative numbers.
// - Revenue is always net of VAT: totalMinor - vatMinor.
// - Payments: every non-FAILED row (refunds are negative rows), bucketed by
//   `receivedAt`.
// - Payroll: payslips of APPROVED/PAID runs, attributed to the run's
//   periodMonth; cost = net pay + employee GOSI + employer GOSI (what the
//   center actually pays out). A range that covers part of a month still
//   includes that month's full payroll.

import type { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CsvColumn } from "@/modules/reports/csv";
import { METHOD_LABELS } from "./expenses";
import {
  dateISOOf,
  daysBetween,
  minorToSarString,
  monthKeyOf,
  monthsInRange,
  periodKeyOf,
  periodsInRange,
  type AccountingRange,
  type VatPeriod,
} from "./periods";

export const REVENUE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "PAID"] as const;

const SERVICE_LINE_KINDS = new Set(["SERVICE", "PACKAGE"]);
const PRODUCT_LINE_KINDS = new Set(["PRODUCT"]);

const invoiceInclude = {
  lines: {
    select: { kind: true, serviceId: true, productId: true, description: true, qty: true, totalMinor: true, vatMinor: true },
  },
} satisfies Prisma.InvoiceInclude;

type LoadedInvoice = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

async function loadIssuedInvoices(range: Pick<AccountingRange, "from" | "to">): Promise<LoadedInvoice[]> {
  return prisma.invoice.findMany({
    where: { status: { in: [...REVENUE_STATUSES] }, issuedAt: { gte: range.from, lt: range.to } },
    include: invoiceInclude,
    orderBy: { issuedAt: "asc" },
  });
}

export function isCreditNote(invoice: { kind: string }): boolean {
  return invoice.kind === "CREDIT_NOTE";
}

/** Signed net/VAT/total of an invoice: credit notes come out negative. */
export function signedAmounts(invoice: { kind: string; totalMinor: number; vatMinor: number }) {
  const sign = isCreditNote(invoice) ? -1 : 1;
  const total = Math.abs(invoice.totalMinor);
  const vat = Math.abs(invoice.vatMinor);
  return { sign, totalMinor: sign * total, vatMinor: sign * vat, netMinor: sign * (total - vat) };
}

export interface RevenueSplit {
  servicesMinor: number;
  productsMinor: number;
  otherMinor: number;
  netMinor: number;
}

/**
 * Splits one invoice's net revenue into services / products / other using
 * its lines. Anything the lines don't explain (an invoice-level discount,
 * gift cards, misc lines) lands in "other" so the split always sums to the
 * invoice header's net.
 */
export function splitInvoiceRevenue(invoice: {
  kind: string;
  totalMinor: number;
  vatMinor: number;
  lines: { kind: string; totalMinor: number; vatMinor: number }[];
}): RevenueSplit {
  const { sign, netMinor } = signedAmounts(invoice);
  let servicesMinor = 0;
  let productsMinor = 0;
  for (const line of invoice.lines) {
    const lineNet = sign * Math.abs(line.totalMinor - line.vatMinor);
    if (SERVICE_LINE_KINDS.has(line.kind)) servicesMinor += lineNet;
    else if (PRODUCT_LINE_KINDS.has(line.kind)) productsMinor += lineNet;
  }
  return { servicesMinor, productsMinor, otherMinor: netMinor - servicesMinor - productsMinor, netMinor };
}

// ---- COGS ------------------------------------------------------------------

export interface CogsTotals {
  productsMinor: number;
  consumablesMinor: number;
}

async function loadCogsMovements(range: Pick<AccountingRange, "from" | "to">) {
  return prisma.stockMovement.findMany({
    where: {
      createdAt: { gte: range.from, lt: range.to },
      OR: [{ type: { in: ["SALE", "CONSUMPTION"] } }, { type: "RETURN", refType: "INVOICE" }],
    },
    select: { type: true, qty: true, unitCostMinor: true, createdAt: true, product: { select: { costMinor: true } } },
  });
}

/**
 * Cost of one movement: stock-out quantities are negative, so -qty x cost is
 * a positive cost for a SALE/CONSUMPTION and a negative one (a reversal) for
 * a customer RETURN against an invoice. Uses the movement's own unit cost
 * when recorded, else the product's current cost.
 */
export function movementCost(m: { qty: number; unitCostMinor: number | null; product: { costMinor: number } }): number {
  return -m.qty * (m.unitCostMinor ?? m.product.costMinor);
}

// ---- Profit & loss -------------------------------------------------------------

export interface PnlMonth {
  month: string;
  servicesMinor: number;
  productsMinor: number;
  otherRevenueMinor: number;
  revenueMinor: number;
  cogsProductsMinor: number;
  cogsConsumablesMinor: number;
  cogsMinor: number;
  grossProfitMinor: number;
  expensesByCategory: Record<string, number>;
  expensesMinor: number;
  payrollMinor: number;
  netMinor: number;
}

export interface ProfitAndLoss {
  months: PnlMonth[];
  total: PnlMonth;
  categories: string[];
}

function emptyMonth(month: string): PnlMonth {
  return {
    month,
    servicesMinor: 0,
    productsMinor: 0,
    otherRevenueMinor: 0,
    revenueMinor: 0,
    cogsProductsMinor: 0,
    cogsConsumablesMinor: 0,
    cogsMinor: 0,
    grossProfitMinor: 0,
    expensesByCategory: {},
    expensesMinor: 0,
    payrollMinor: 0,
    netMinor: 0,
  };
}

function finalizeMonth(m: PnlMonth): PnlMonth {
  m.revenueMinor = m.servicesMinor + m.productsMinor + m.otherRevenueMinor;
  m.cogsMinor = m.cogsProductsMinor + m.cogsConsumablesMinor;
  m.grossProfitMinor = m.revenueMinor - m.cogsMinor;
  m.expensesMinor = Object.values(m.expensesByCategory).reduce((a, b) => a + b, 0);
  m.netMinor = m.grossProfitMinor - m.expensesMinor - m.payrollMinor;
  return m;
}

export function payslipCost(p: { netMinor: number; gosiEmployeeMinor: number; gosiEmployerMinor: number }): number {
  return p.netMinor + p.gosiEmployeeMinor + p.gosiEmployerMinor;
}

export async function profitAndLoss(range: AccountingRange): Promise<ProfitAndLoss> {
  const monthKeys = monthsInRange(range.fromISO, range.toISO);
  const [invoices, movements, expenses, runs] = await Promise.all([
    loadIssuedInvoices(range),
    loadCogsMovements(range),
    prisma.expense.findMany({
      where: { paidAt: { gte: range.from, lt: range.to } },
      select: { paidAt: true, amountMinor: true, category: { select: { name: true } } },
    }),
    prisma.payrollRun.findMany({
      where: { periodMonth: { in: monthKeys }, status: { in: ["APPROVED", "PAID"] } },
      select: { periodMonth: true, payslips: { select: { netMinor: true, gosiEmployeeMinor: true, gosiEmployerMinor: true } } },
    }),
  ]);

  const byMonth = new Map(monthKeys.map((k) => [k, emptyMonth(k)]));
  const monthOf = (key: string) => byMonth.get(key) ?? byMonth.set(key, emptyMonth(key)).get(key)!;

  for (const invoice of invoices) {
    const m = monthOf(monthKeyOf(invoice.issuedAt!));
    const split = splitInvoiceRevenue(invoice);
    m.servicesMinor += split.servicesMinor;
    m.productsMinor += split.productsMinor;
    m.otherRevenueMinor += split.otherMinor;
  }
  for (const movement of movements) {
    const m = monthOf(monthKeyOf(movement.createdAt));
    if (movement.type === "CONSUMPTION") m.cogsConsumablesMinor += movementCost(movement);
    else m.cogsProductsMinor += movementCost(movement);
  }
  const categories = new Set<string>();
  for (const expense of expenses) {
    const m = monthOf(monthKeyOf(expense.paidAt));
    const name = expense.category?.name ?? "Uncategorized";
    categories.add(name);
    m.expensesByCategory[name] = (m.expensesByCategory[name] ?? 0) + expense.amountMinor;
  }
  for (const run of runs) {
    const m = monthOf(run.periodMonth);
    m.payrollMinor += run.payslips.reduce((sum, p) => sum + payslipCost(p), 0);
  }

  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).map(finalizeMonth);
  const total = emptyMonth("Total");
  for (const m of months) {
    total.servicesMinor += m.servicesMinor;
    total.productsMinor += m.productsMinor;
    total.otherRevenueMinor += m.otherRevenueMinor;
    total.cogsProductsMinor += m.cogsProductsMinor;
    total.cogsConsumablesMinor += m.cogsConsumablesMinor;
    total.payrollMinor += m.payrollMinor;
    for (const [name, value] of Object.entries(m.expensesByCategory)) {
      total.expensesByCategory[name] = (total.expensesByCategory[name] ?? 0) + value;
    }
  }
  return { months, total: finalizeMonth(total), categories: [...categories].sort() };
}

// ---- VAT return ------------------------------------------------------------------

export interface VatPeriodRow {
  period: string;
  /** Standard-rated (15%) sales, net of VAT, before credit notes. */
  standardSalesMinor: number;
  standardVatMinor: number;
  /** Sales invoiced with no VAT (zero-rated / exempt). */
  zeroRatedSalesMinor: number;
  /** Credit notes issued in the period, as positive adjustments. */
  creditNotesNetMinor: number;
  creditNotesVatMinor: number;
  outputVatMinor: number;
  /** Expenses carrying input VAT (net of VAT). */
  purchasesMinor: number;
  inputVatMinor: number;
  /** Expenses with no VAT (salaries, government fees, non-registered vendors). */
  nonVatPurchasesMinor: number;
  netVatMinor: number;
}

function emptyVatRow(period: string): VatPeriodRow {
  return {
    period,
    standardSalesMinor: 0,
    standardVatMinor: 0,
    zeroRatedSalesMinor: 0,
    creditNotesNetMinor: 0,
    creditNotesVatMinor: 0,
    outputVatMinor: 0,
    purchasesMinor: 0,
    inputVatMinor: 0,
    nonVatPurchasesMinor: 0,
    netVatMinor: 0,
  };
}

function finalizeVatRow(row: VatPeriodRow): VatPeriodRow {
  row.outputVatMinor = row.standardVatMinor - row.creditNotesVatMinor;
  row.netVatMinor = row.outputVatMinor - row.inputVatMinor;
  return row;
}

export interface VatSummary {
  period: VatPeriod;
  rows: VatPeriodRow[];
  total: VatPeriodRow;
}

export async function vatSummary(range: AccountingRange, period: VatPeriod = "quarter"): Promise<VatSummary> {
  const [invoices, expenses] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: { in: [...REVENUE_STATUSES] }, issuedAt: { gte: range.from, lt: range.to } },
      select: { kind: true, issuedAt: true, totalMinor: true, vatMinor: true },
    }),
    prisma.expense.findMany({
      where: { paidAt: { gte: range.from, lt: range.to } },
      select: { paidAt: true, amountMinor: true, vatMinor: true },
    }),
  ]);

  const rows = new Map(periodsInRange(range.fromISO, range.toISO, period).map((k) => [k, emptyVatRow(k)]));
  const rowOf = (key: string) => rows.get(key) ?? rows.set(key, emptyVatRow(key)).get(key)!;

  for (const invoice of invoices) {
    const row = rowOf(periodKeyOf(invoice.issuedAt!, period));
    const total = Math.abs(invoice.totalMinor);
    const vat = Math.abs(invoice.vatMinor);
    if (isCreditNote(invoice)) {
      row.creditNotesNetMinor += total - vat;
      row.creditNotesVatMinor += vat;
    } else if (vat > 0) {
      row.standardSalesMinor += total - vat;
      row.standardVatMinor += vat;
    } else {
      row.zeroRatedSalesMinor += total;
    }
  }
  for (const expense of expenses) {
    const row = rowOf(periodKeyOf(expense.paidAt, period));
    if (expense.vatMinor > 0) {
      row.purchasesMinor += expense.amountMinor;
      row.inputVatMinor += expense.vatMinor;
    } else {
      row.nonVatPurchasesMinor += expense.amountMinor;
    }
  }

  const list = [...rows.values()].sort((a, b) => a.period.localeCompare(b.period)).map(finalizeVatRow);
  const total = emptyVatRow("Total");
  for (const row of list) {
    total.standardSalesMinor += row.standardSalesMinor;
    total.standardVatMinor += row.standardVatMinor;
    total.zeroRatedSalesMinor += row.zeroRatedSalesMinor;
    total.creditNotesNetMinor += row.creditNotesNetMinor;
    total.creditNotesVatMinor += row.creditNotesVatMinor;
    total.purchasesMinor += row.purchasesMinor;
    total.inputVatMinor += row.inputVatMinor;
    total.nonVatPurchasesMinor += row.nonVatPurchasesMinor;
  }
  return { period, rows: list, total: finalizeVatRow(total) };
}

// ---- Receivables aging -------------------------------------------------------------

export const AGING_BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export function agingBucketFor(days: number): AgingBucket {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export interface ReceivableRow {
  invoiceId: string;
  number: string;
  customerName: string;
  issuedAt: Date;
  ageDays: number;
  bucket: AgingBucket;
  totalMinor: number;
  paidMinor: number;
  creditedMinor: number;
  outstandingMinor: number;
}

export interface ReceivablesAging {
  asOf: Date;
  rows: ReceivableRow[];
  buckets: Record<AgingBucket, number>;
  totalMinor: number;
}

/**
 * Open receivables as of `asOf`: issued invoices still ISSUED or
 * PARTIALLY_PAID, less payments recorded on them and less credit notes
 * issued against them (originalInvoiceId). Aged from the issue date.
 */
export async function receivablesAging(asOf: Date = new Date()): Promise<ReceivablesAging> {
  const invoices = await prisma.invoice.findMany({
    where: { kind: { not: "CREDIT_NOTE" }, status: { in: ["ISSUED", "PARTIALLY_PAID"] }, issuedAt: { lte: asOf } },
    select: { id: true, number: true, customerName: true, issuedAt: true, totalMinor: true, paidMinor: true },
    orderBy: { issuedAt: "asc" },
  });
  const credits = invoices.length
    ? await prisma.invoice.findMany({
        where: {
          kind: "CREDIT_NOTE",
          status: { in: [...REVENUE_STATUSES] },
          originalInvoiceId: { in: invoices.map((i) => i.id) },
          issuedAt: { lte: asOf },
        },
        select: { originalInvoiceId: true, totalMinor: true },
      })
    : [];
  const creditedBy = new Map<string, number>();
  for (const c of credits) {
    creditedBy.set(c.originalInvoiceId!, (creditedBy.get(c.originalInvoiceId!) ?? 0) + Math.abs(c.totalMinor));
  }

  const buckets = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])) as Record<AgingBucket, number>;
  const rows: ReceivableRow[] = [];
  for (const invoice of invoices) {
    const creditedMinor = creditedBy.get(invoice.id) ?? 0;
    const outstandingMinor = invoice.totalMinor - invoice.paidMinor - creditedMinor;
    if (outstandingMinor <= 0) continue;
    const ageDays = daysBetween(invoice.issuedAt!, asOf);
    const bucket = agingBucketFor(ageDays);
    buckets[bucket] += outstandingMinor;
    rows.push({
      invoiceId: invoice.id,
      number: invoice.number,
      customerName: invoice.customerName,
      issuedAt: invoice.issuedAt!,
      ageDays,
      bucket,
      totalMinor: invoice.totalMinor,
      paidMinor: invoice.paidMinor,
      creditedMinor,
      outstandingMinor,
    });
  }
  return { asOf, rows, buckets, totalMinor: rows.reduce((s, r) => s + r.outstandingMinor, 0) };
}

// ---- Payments by method --------------------------------------------------------------

export interface MethodTotal {
  method: PaymentMethod;
  label: string;
  count: number;
  amountMinor: number;
}

export async function paymentsByMethod(range: Pick<AccountingRange, "from" | "to">): Promise<MethodTotal[]> {
  const groups = await prisma.payment.groupBy({
    by: ["method"],
    where: { receivedAt: { gte: range.from, lt: range.to }, status: { not: "FAILED" } },
    _sum: { amountMinor: true },
    _count: true,
  });
  return groups
    .map((g) => ({ method: g.method, label: METHOD_LABELS[g.method], count: g._count, amountMinor: g._sum.amountMinor ?? 0 }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

// ---- Dashboard ------------------------------------------------------------------------

export interface AccountingDashboard {
  revenueMinor: number;
  invoicedNetMinor: number;
  creditNotesNetMinor: number;
  outputVatMinor: number;
  invoiceCount: number;
  collectedMinor: number;
  collectedByMethod: MethodTotal[];
  expensesMinor: number;
  inputVatMinor: number;
  cogsMinor: number;
  grossProfitMinor: number;
  receivables: ReceivablesAging;
  trend: { month: string; revenueMinor: number; expensesMinor: number; netMinor: number }[];
}

export async function accountingDashboard(range: AccountingRange, trendRange: AccountingRange, asOf: Date = new Date()): Promise<AccountingDashboard> {
  const [invoices, movements, expenseAgg, collectedByMethod, receivables, trendPnl] = await Promise.all([
    loadIssuedInvoices(range),
    loadCogsMovements(range),
    prisma.expense.aggregate({
      where: { paidAt: { gte: range.from, lt: range.to } },
      _sum: { amountMinor: true, vatMinor: true },
    }),
    paymentsByMethod(range),
    receivablesAging(asOf),
    profitAndLoss(trendRange),
  ]);

  let invoicedNetMinor = 0;
  let creditNotesNetMinor = 0;
  let outputVatMinor = 0;
  let invoiceCount = 0;
  for (const invoice of invoices) {
    const a = signedAmounts(invoice);
    if (a.sign < 0) creditNotesNetMinor += -a.netMinor;
    else {
      invoicedNetMinor += a.netMinor;
      invoiceCount += 1;
    }
    outputVatMinor += a.vatMinor;
  }
  const revenueMinor = invoicedNetMinor - creditNotesNetMinor;
  const cogsMinor = movements.reduce((sum, m) => sum + movementCost(m), 0);

  return {
    revenueMinor,
    invoicedNetMinor,
    creditNotesNetMinor,
    outputVatMinor,
    invoiceCount,
    collectedMinor: collectedByMethod.reduce((s, m) => s + m.amountMinor, 0),
    collectedByMethod,
    expensesMinor: expenseAgg._sum.amountMinor ?? 0,
    inputVatMinor: expenseAgg._sum.vatMinor ?? 0,
    cogsMinor,
    grossProfitMinor: revenueMinor - cogsMinor,
    receivables,
    trend: trendPnl.months.map((m) => ({
      month: m.month,
      revenueMinor: m.revenueMinor,
      expensesMinor: m.expensesMinor + m.payrollMinor + m.cogsMinor,
      netMinor: m.netMinor,
    })),
  };
}

// ---- Sales analysis -----------------------------------------------------------------------

export interface SalesGroupRow {
  key: string;
  label: string;
  qty: number;
  netMinor: number;
}

export interface SalesAnalysis {
  byService: SalesGroupRow[];
  byDepartment: SalesGroupRow[];
  byStaff: SalesGroupRow[];
  byProduct: SalesGroupRow[];
  byMethod: MethodTotal[];
  invoiceCount: number;
  invoicesTotalMinor: number;
  averageInvoiceMinor: number;
  averageInvoiceNetMinor: number;
}

function addTo(map: Map<string, SalesGroupRow>, key: string, label: string, qty: number, netMinor: number) {
  const row = map.get(key) ?? { key, label, qty: 0, netMinor: 0 };
  row.qty += qty;
  row.netMinor += netMinor;
  map.set(key, row);
}

const sortRows = (map: Map<string, SalesGroupRow>) => [...map.values()].sort((a, b) => b.netMinor - a.netMinor);

const UNASSIGNED_STAFF = "Unassigned";

export async function salesAnalysis(range: AccountingRange): Promise<SalesAnalysis> {
  const [invoices, byMethod] = await Promise.all([loadIssuedInvoices(range), paymentsByMethod(range)]);

  const serviceIds = new Set<string>();
  const productIds = new Set<string>();
  const bookingIds = new Set<string>();
  for (const invoice of invoices) {
    if (invoice.bookingId) bookingIds.add(invoice.bookingId);
    for (const line of invoice.lines) {
      if (line.serviceId) serviceIds.add(line.serviceId);
      if (line.productId) productIds.add(line.productId);
    }
  }
  const [services, products, appointments] = await Promise.all([
    prisma.service.findMany({
      where: { id: { in: [...serviceIds] } },
      select: { id: true, nameEn: true, department: { select: { id: true, nameEn: true } } },
    }),
    prisma.product.findMany({ where: { id: { in: [...productIds] } }, select: { id: true, nameEn: true } }),
    prisma.appointment.findMany({
      where: { bookingId: { in: [...bookingIds] } },
      select: { bookingId: true, serviceId: true, staffUserId: true, startAt: true },
      orderBy: { startAt: "asc" },
    }),
  ]);
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const productById = new Map(products.map((p) => [p.id, p]));
  const apptsByBooking = new Map<string, typeof appointments>();
  for (const a of appointments) apptsByBooking.set(a.bookingId, [...(apptsByBooking.get(a.bookingId) ?? []), a]);
  const staffNameById = await (async () => {
    const ids = [...new Set(appointments.map((a) => a.staffUserId))];
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true, staffProfile: { select: { fullName: true } } },
    });
    return new Map(users.map((u) => [u.id, u.staffProfile?.fullName || u.email || "Staff"]));
  })();

  const byService = new Map<string, SalesGroupRow>();
  const byDepartment = new Map<string, SalesGroupRow>();
  const byStaff = new Map<string, SalesGroupRow>();
  const byProduct = new Map<string, SalesGroupRow>();
  let invoiceCount = 0;
  let invoicesTotalMinor = 0;
  let invoicesNetMinor = 0;

  for (const invoice of invoices) {
    const { sign, totalMinor, netMinor } = signedAmounts(invoice);
    if (sign > 0) {
      invoiceCount += 1;
      invoicesTotalMinor += totalMinor;
      invoicesNetMinor += netMinor;
    }
    const appts = invoice.bookingId ? (apptsByBooking.get(invoice.bookingId) ?? []) : [];
    for (const line of invoice.lines) {
      const lineNet = sign * Math.abs(line.totalMinor - line.vatMinor);
      const qty = sign * Math.abs(line.qty);
      if (line.serviceId || SERVICE_LINE_KINDS.has(line.kind)) {
        const service = line.serviceId ? serviceById.get(line.serviceId) : undefined;
        addTo(byService, line.serviceId ?? `desc:${line.description}`, service?.nameEn ?? line.description, qty, lineNet);
        addTo(byDepartment, service?.department.id ?? "none", service?.department.nameEn ?? "No department", qty, lineNet);
      }
      if (line.productId || PRODUCT_LINE_KINDS.has(line.kind)) {
        const product = line.productId ? productById.get(line.productId) : undefined;
        addTo(byProduct, line.productId ?? `desc:${line.description}`, product?.nameEn ?? line.description, qty, lineNet);
      }
      // Staff: the appointment for this line's service on the invoice's
      // booking, else the booking's first appointment; walk-in sales with no
      // booking stay unassigned.
      const appt = appts.find((a) => a.serviceId === line.serviceId) ?? appts[0];
      const staffKey = appt?.staffUserId ?? "none";
      addTo(byStaff, staffKey, appt ? (staffNameById.get(appt.staffUserId) ?? "Staff") : UNASSIGNED_STAFF, qty, lineNet);
    }
  }

  return {
    byService: sortRows(byService),
    byDepartment: sortRows(byDepartment),
    byStaff: sortRows(byStaff),
    byProduct: sortRows(byProduct),
    byMethod,
    invoiceCount,
    invoicesTotalMinor,
    averageInvoiceMinor: invoiceCount ? Math.round(invoicesTotalMinor / invoiceCount) : 0,
    averageInvoiceNetMinor: invoiceCount ? Math.round(invoicesNetMinor / invoiceCount) : 0,
  };
}

// ---- CSV shapes ---------------------------------------------------------------------------

export interface CsvTable {
  columns: CsvColumn[];
  rows: Record<string, unknown>[];
}

const sar = minorToSarString;

export function pnlCsv(pnl: ProfitAndLoss): CsvTable {
  const columns: CsvColumn[] = [
    { key: "month", label: "Month" },
    { key: "services", label: "Service revenue (SAR)" },
    { key: "products", label: "Product revenue (SAR)" },
    { key: "other", label: "Other revenue (SAR)" },
    { key: "revenue", label: "Revenue (SAR)" },
    { key: "cogsProducts", label: "COGS products (SAR)" },
    { key: "cogsConsumables", label: "Consumables used (SAR)" },
    { key: "grossProfit", label: "Gross profit (SAR)" },
    ...pnl.categories.map((c) => ({ key: `cat:${c}`, label: `${c} (SAR)` })),
    { key: "expenses", label: "Total expenses (SAR)" },
    { key: "payroll", label: "Payroll incl. GOSI (SAR)" },
    { key: "net", label: "Net profit (SAR)" },
  ];
  const toRow = (m: PnlMonth) => ({
    month: m.month,
    services: sar(m.servicesMinor),
    products: sar(m.productsMinor),
    other: sar(m.otherRevenueMinor),
    revenue: sar(m.revenueMinor),
    cogsProducts: sar(m.cogsProductsMinor),
    cogsConsumables: sar(m.cogsConsumablesMinor),
    grossProfit: sar(m.grossProfitMinor),
    ...Object.fromEntries(pnl.categories.map((c) => [`cat:${c}`, sar(m.expensesByCategory[c] ?? 0)])),
    expenses: sar(m.expensesMinor),
    payroll: sar(m.payrollMinor),
    net: sar(m.netMinor),
  });
  return { columns, rows: [...pnl.months.map(toRow), toRow(pnl.total)] };
}

export function vatCsv(summary: VatSummary): CsvTable {
  const columns: CsvColumn[] = [
    { key: "period", label: "Period" },
    { key: "standardSales", label: "Standard-rated sales (SAR)" },
    { key: "standardVat", label: "VAT on sales (SAR)" },
    { key: "zeroRated", label: "Zero-rated / exempt sales (SAR)" },
    { key: "creditNet", label: "Credit notes net (SAR)" },
    { key: "creditVat", label: "Credit notes VAT (SAR)" },
    { key: "outputVat", label: "Output VAT (SAR)" },
    { key: "purchases", label: "Purchases with VAT (SAR)" },
    { key: "inputVat", label: "Input VAT (SAR)" },
    { key: "nonVat", label: "Purchases without VAT (SAR)" },
    { key: "netVat", label: "Net VAT payable (SAR)" },
  ];
  const toRow = (r: VatPeriodRow) => ({
    period: r.period,
    standardSales: sar(r.standardSalesMinor),
    standardVat: sar(r.standardVatMinor),
    zeroRated: sar(r.zeroRatedSalesMinor),
    creditNet: sar(r.creditNotesNetMinor),
    creditVat: sar(r.creditNotesVatMinor),
    outputVat: sar(r.outputVatMinor),
    purchases: sar(r.purchasesMinor),
    inputVat: sar(r.inputVatMinor),
    nonVat: sar(r.nonVatPurchasesMinor),
    netVat: sar(r.netVatMinor),
  });
  return { columns, rows: [...summary.rows.map(toRow), toRow(summary.total)] };
}

export function salesCsv(sales: SalesAnalysis): CsvTable {
  const columns: CsvColumn[] = [
    { key: "section", label: "Section" },
    { key: "label", label: "Item" },
    { key: "qty", label: "Qty / count" },
    { key: "amount", label: "Amount (SAR)" },
  ];
  const rows: Record<string, unknown>[] = [];
  const push = (section: string, list: SalesGroupRow[]) =>
    list.forEach((r) => rows.push({ section, label: r.label, qty: r.qty, amount: sar(r.netMinor) }));
  push("Service (net)", sales.byService);
  push("Department (net)", sales.byDepartment);
  push("Staff (net)", sales.byStaff);
  push("Product (net)", sales.byProduct);
  sales.byMethod.forEach((m) => rows.push({ section: "Payment method (collected)", label: m.label, qty: m.count, amount: sar(m.amountMinor) }));
  rows.push({ section: "Invoices", label: "Average invoice incl. VAT", qty: sales.invoiceCount, amount: sar(sales.averageInvoiceMinor) });
  rows.push({ section: "Invoices", label: "Average invoice excl. VAT", qty: sales.invoiceCount, amount: sar(sales.averageInvoiceNetMinor) });
  return { columns, rows };
}

export function dashboardCsv(d: AccountingDashboard): CsvTable {
  const columns: CsvColumn[] = [
    { key: "metric", label: "Metric" },
    { key: "amount", label: "Amount (SAR)" },
  ];
  const rows: Record<string, unknown>[] = [
    { metric: "Invoiced (net of VAT)", amount: sar(d.invoicedNetMinor) },
    { metric: "Credit notes (net of VAT)", amount: sar(-d.creditNotesNetMinor) },
    { metric: "Revenue", amount: sar(d.revenueMinor) },
    { metric: "Cost of goods sold", amount: sar(d.cogsMinor) },
    { metric: "Gross profit", amount: sar(d.grossProfitMinor) },
    { metric: "Expenses (excl. VAT)", amount: sar(d.expensesMinor) },
    { metric: "Output VAT", amount: sar(d.outputVatMinor) },
    { metric: "Input VAT", amount: sar(d.inputVatMinor) },
    { metric: "Collected (all methods)", amount: sar(d.collectedMinor) },
    ...d.collectedByMethod.map((m) => ({ metric: `Collected - ${m.label}`, amount: sar(m.amountMinor) })),
    ...AGING_BUCKETS.map((b) => ({ metric: `Receivables ${b} days`, amount: sar(d.receivables.buckets[b]) })),
    { metric: "Receivables total", amount: sar(d.receivables.totalMinor) },
  ];
  return { columns, rows };
}

export function receivablesCsv(aging: ReceivablesAging): CsvTable {
  return {
    columns: [
      { key: "number", label: "Invoice" },
      { key: "customer", label: "Customer" },
      { key: "issued", label: "Issued" },
      { key: "age", label: "Age (days)" },
      { key: "bucket", label: "Bucket" },
      { key: "total", label: "Total (SAR)" },
      { key: "paid", label: "Paid (SAR)" },
      { key: "credited", label: "Credited (SAR)" },
      { key: "outstanding", label: "Outstanding (SAR)" },
    ],
    rows: aging.rows.map((r) => ({
      number: r.number,
      customer: r.customerName,
      issued: dateISOOf(r.issuedAt),
      age: r.ageDays,
      bucket: r.bucket,
      total: sar(r.totalMinor),
      paid: sar(r.paidMinor),
      credited: sar(r.creditedMinor),
      outstanding: sar(r.outstandingMinor),
    })),
  };
}
