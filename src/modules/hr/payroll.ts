// Monthly payroll. A run for "YYYY-MM" holds one Payslip per active staff
// member with an employee file. Workflow: DRAFT (editable, recalculable) ->
// APPROVED (locked) -> PAID. Amounts are integer halalas throughout.

import { z } from "zod";
import { Prisma, type EmployeeRecord } from "@prisma/client";
import { prisma } from "@/lib/db";
import { centerLocalToUtc } from "@/modules/booking/availability";
import { GOSI_BASE_CAP_MINOR, GOSI_RATES_BP, PAYROLL_DAYS_PER_MONTH, type PayrollStatus } from "./constants";
import { isMonthISO, isoToDate, monthBounds } from "./dates";
import { monthlyFixedPayMinor } from "./employees";
import { approvedLeaveDaysInMonth } from "./leave";

// ---------------------------------------------------------------------------
// Pure calculations
// ---------------------------------------------------------------------------

const bpOf = (amountMinor: number, bp: number) => Math.round((amountMinor * bp) / 10_000);

export interface GosiResult {
  baseMinor: number;
  employeeMinor: number;
  employerMinor: number;
}

/** GOSI on basic + housing, capped at SAR 45,000/month (rates in constants.ts). */
export function computeGosi(input: {
  isSaudi: boolean;
  gosiApplicable: boolean;
  basicMinor: number;
  housingMinor: number;
}): GosiResult {
  if (!input.gosiApplicable) return { baseMinor: 0, employeeMinor: 0, employerMinor: 0 };
  const baseMinor = Math.min(input.basicMinor + input.housingMinor, GOSI_BASE_CAP_MINOR);
  const rates = input.isSaudi ? GOSI_RATES_BP.saudi : GOSI_RATES_BP.nonSaudi;
  return { baseMinor, employeeMinor: bpOf(baseMinor, rates.employee), employerMinor: bpOf(baseMinor, rates.employer) };
}

export function computeCommission(revenueMinor: number, commissionBp: number): number {
  return bpOf(revenueMinor, commissionBp);
}

/** Saudi practice: one day's wage = monthly fixed pay / 30. */
export function dailyRateMinor(monthlyFixedMinor: number): number {
  return Math.round(monthlyFixedMinor / PAYROLL_DAYS_PER_MONTH);
}

export interface PayslipAmounts {
  basicMinor: number;
  housingMinor: number;
  transportMinor: number;
  otherAllowMinor: number;
  commissionMinor: number;
  overtimeMinor: number;
  bonusMinor: number;
  deductionsMinor: number;
  gosiEmployeeMinor: number;
}

export function grossMinor(s: Omit<PayslipAmounts, "deductionsMinor" | "gosiEmployeeMinor">): number {
  return (
    s.basicMinor + s.housingMinor + s.transportMinor + s.otherAllowMinor + s.commissionMinor + s.overtimeMinor + s.bonusMinor
  );
}

/** Net = gross - deductions - employee GOSI share. */
export function netMinor(s: PayslipAmounts): number {
  return grossMinor(s) - s.deductionsMinor - s.gosiEmployeeMinor;
}

export interface ManualParts {
  overtimeMinor: number;
  bonusMinor: number;
  deductionsMinor: number;
  notes: string | null;
}

/** Builds a payslip from the employee file, month revenue and manual parts. */
export function buildPayslip(
  record: Pick<
    EmployeeRecord,
    | "basicSalaryMinor"
    | "housingAllowanceMinor"
    | "transportAllowanceMinor"
    | "otherAllowanceMinor"
    | "commissionBp"
    | "isSaudi"
    | "gosiApplicable"
  >,
  revenueMinor: number,
  manual: ManualParts,
) {
  const gosi = computeGosi({
    isSaudi: record.isSaudi,
    gosiApplicable: record.gosiApplicable,
    basicMinor: record.basicSalaryMinor,
    housingMinor: record.housingAllowanceMinor,
  });
  const amounts: PayslipAmounts = {
    basicMinor: record.basicSalaryMinor,
    housingMinor: record.housingAllowanceMinor,
    transportMinor: record.transportAllowanceMinor,
    otherAllowMinor: record.otherAllowanceMinor,
    commissionMinor: computeCommission(revenueMinor, record.commissionBp),
    overtimeMinor: manual.overtimeMinor,
    bonusMinor: manual.bonusMinor,
    deductionsMinor: manual.deductionsMinor,
    gosiEmployeeMinor: gosi.employeeMinor,
  };
  return { ...amounts, gosiEmployerMinor: gosi.employerMinor, netMinor: netMinor(amounts), notes: manual.notes };
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

const NEXT: Record<PayrollStatus, PayrollStatus | null> = { DRAFT: "APPROVED", APPROVED: "PAID", PAID: null };

export function canTransition(from: string, to: string): boolean {
  return NEXT[from as PayrollStatus] === to;
}

export function isEditable(status: string): boolean {
  return status === "DRAFT";
}

export class PayrollError extends Error {}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/** Completed-service revenue per staff member for a center-local month. */
export async function completedRevenueByStaff(month: string): Promise<Map<string, number>> {
  const { firstISO, lastISO } = monthBounds(month);
  const rows = await prisma.appointment.groupBy({
    by: ["staffUserId"],
    where: {
      startAt: { gte: centerLocalToUtc(firstISO, 0), lt: centerLocalToUtc(lastISO, 1440) },
      booking: { status: "COMPLETED" },
    },
    _sum: { priceMinorSnapshot: true },
  });
  return new Map(rows.map((r) => [r.staffUserId, r._sum.priceMinorSnapshot ?? 0]));
}

/** Active staff with an employee file who had started by the end of the month. */
async function eligibleRecords(month: string) {
  const { lastISO } = monthBounds(month);
  return prisma.employeeRecord.findMany({
    where: {
      user: { isActive: true, type: "STAFF" },
      OR: [{ hireDate: null }, { hireDate: { lte: isoToDate(lastISO) } }],
    },
  });
}

/** Suggested unpaid-leave deduction: daily rate x approved UNPAID days in the month. */
export async function suggestedUnpaidDeduction(
  record: Pick<EmployeeRecord, "userId" | "basicSalaryMinor" | "housingAllowanceMinor" | "transportAllowanceMinor" | "otherAllowanceMinor">,
  month: string,
): Promise<{ days: number; amountMinor: number }> {
  const days = await approvedLeaveDaysInMonth(record.userId, month, "UNPAID");
  return { days, amountMinor: days * dailyRateMinor(monthlyFixedPayMinor(record)) };
}

async function refreshRunTotal(tx: Prisma.TransactionClient, runId: string): Promise<void> {
  const agg = await tx.payslip.aggregate({ where: { payrollRunId: runId }, _sum: { netMinor: true } });
  await tx.payrollRun.update({ where: { id: runId }, data: { totalNetMinor: agg._sum.netMinor ?? 0 } });
}

export async function createPayrollRun(month: string, createdById: string): Promise<{ id: string }> {
  if (!isMonthISO(month)) throw new PayrollError("Choose a month (YYYY-MM).");
  const existing = await prisma.payrollRun.findUnique({ where: { periodMonth: month } });
  if (existing) throw new PayrollError(`A payroll run for ${month} already exists.`);

  const [records, revenue] = await Promise.all([eligibleRecords(month), completedRevenueByStaff(month)]);
  const slips: ({ userId: string } & ReturnType<typeof buildPayslip>)[] = [];
  for (const record of records) {
    const unpaid = await suggestedUnpaidDeduction(record, month);
    slips.push({
      userId: record.userId,
      ...buildPayslip(record, revenue.get(record.userId) ?? 0, {
        overtimeMinor: 0,
        bonusMinor: 0,
        deductionsMinor: unpaid.amountMinor,
        notes: unpaid.days ? `Unpaid leave: ${unpaid.days} day(s)` : null,
      }),
    });
  }

  try {
    const run = await prisma.payrollRun.create({
      data: {
        periodMonth: month,
        createdById,
        totalNetMinor: slips.reduce((s, p) => s + p.netMinor, 0),
        payslips: { create: slips },
      },
    });
    return { id: run.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new PayrollError(`A payroll run for ${month} already exists.`);
    }
    throw err;
  }
}

async function requireDraft(tx: Prisma.TransactionClient, runId: string) {
  const run = await tx.payrollRun.findUnique({ where: { id: runId } });
  if (!run) throw new PayrollError("Payroll run not found.");
  if (!isEditable(run.status)) throw new PayrollError(`This run is ${run.status.toLowerCase()} and can no longer be changed.`);
  return run;
}

/**
 * Re-reads employee files and revenue for a DRAFT run. Manual parts
 * (overtime, bonus, deductions, notes) are kept; employees who joined or left
 * since are added/removed.
 */
export async function recalculatePayrollRun(runId: string): Promise<void> {
  const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { payslips: true } });
  if (!run) throw new PayrollError("Payroll run not found.");
  if (!isEditable(run.status)) throw new PayrollError(`This run is ${run.status.toLowerCase()} and can no longer be changed.`);

  const [records, revenue] = await Promise.all([eligibleRecords(run.periodMonth), completedRevenueByStaff(run.periodMonth)]);
  const existing = new Map(run.payslips.map((p) => [p.userId, p]));
  const planned: ({ userId: string } & ReturnType<typeof buildPayslip>)[] = [];
  for (const record of records) {
    const prev = existing.get(record.userId);
    let manual: ManualParts;
    if (prev) {
      manual = { overtimeMinor: prev.overtimeMinor, bonusMinor: prev.bonusMinor, deductionsMinor: prev.deductionsMinor, notes: prev.notes };
    } else {
      const unpaid = await suggestedUnpaidDeduction(record, run.periodMonth);
      manual = { overtimeMinor: 0, bonusMinor: 0, deductionsMinor: unpaid.amountMinor, notes: unpaid.days ? `Unpaid leave: ${unpaid.days} day(s)` : null };
    }
    planned.push({ userId: record.userId, ...buildPayslip(record, revenue.get(record.userId) ?? 0, manual) });
  }
  const keep = new Set(planned.map((p) => p.userId));

  await prisma.$transaction(async (tx) => {
    await requireDraft(tx, runId);
    await tx.payslip.deleteMany({ where: { payrollRunId: runId, userId: { notIn: [...keep] } } });
    for (const slip of planned) {
      await tx.payslip.upsert({
        where: { payrollRunId_userId: { payrollRunId: runId, userId: slip.userId } },
        create: { payrollRunId: runId, ...slip },
        update: slip,
      });
    }
    await refreshRunTotal(tx, runId);
  });
}

const sar = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    const cleaned = (v ?? "").replace(/,/g, "");
    if (!cleaned) return 0;
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0 || n > 10_000_000) {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount in SAR" });
      return z.NEVER;
    }
    return Math.round(n * 100);
  });

export const payslipEditSchema = z.object({
  overtime: sar,
  bonus: sar,
  deductions: sar,
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : null)),
});

export type PayslipEditInput = z.input<typeof payslipEditSchema>;

/** Edits the manual parts of one payslip (DRAFT runs only) and recomputes net. */
export async function updatePayslip(payslipId: string, input: PayslipEditInput): Promise<void> {
  const parsed = payslipEditSchema.safeParse(input);
  if (!parsed.success) throw new PayrollError(parsed.error.issues[0]?.message ?? "Invalid amounts.");
  const v = parsed.data;
  await prisma.$transaction(async (tx) => {
    const slip = await tx.payslip.findUnique({ where: { id: payslipId } });
    if (!slip) throw new PayrollError("Payslip not found.");
    await requireDraft(tx, slip.payrollRunId);
    const amounts: PayslipAmounts = {
      ...slip,
      overtimeMinor: v.overtime,
      bonusMinor: v.bonus,
      deductionsMinor: v.deductions,
    };
    await tx.payslip.update({
      where: { id: payslipId },
      data: { overtimeMinor: v.overtime, bonusMinor: v.bonus, deductionsMinor: v.deductions, notes: v.notes, netMinor: netMinor(amounts) },
    });
    await refreshRunTotal(tx, slip.payrollRunId);
  });
}

async function transition(runId: string, to: PayrollStatus, data: Prisma.PayrollRunUpdateManyMutationInput) {
  const run = await prisma.payrollRun.findUnique({ where: { id: runId } });
  if (!run) throw new PayrollError("Payroll run not found.");
  if (!canTransition(run.status, to)) {
    throw new PayrollError(`A ${run.status.toLowerCase()} run cannot be marked ${to.toLowerCase()}.`);
  }
  // Guarded on the current status so concurrent clicks can't double-apply.
  const res = await prisma.payrollRun.updateMany({ where: { id: runId, status: run.status }, data: { status: to, ...data } });
  if (res.count === 0) throw new PayrollError("The run changed in the meantime; reload and try again.");
}

export async function approvePayrollRun(runId: string, approverId: string): Promise<void> {
  await transition(runId, "APPROVED", { approvedById: approverId, approvedAt: new Date() });
}

export async function markPayrollRunPaid(runId: string): Promise<void> {
  await transition(runId, "PAID", { paidAt: new Date() });
}

export async function deleteDraftRun(runId: string): Promise<void> {
  const res = await prisma.payrollRun.deleteMany({ where: { id: runId, status: "DRAFT" } });
  if (res.count === 0) throw new PayrollError("Only draft runs can be deleted.");
}

export async function listPayrollRuns() {
  return prisma.payrollRun.findMany({ orderBy: { periodMonth: "desc" }, include: { _count: { select: { payslips: true } } } });
}

const userInclude = {
  email: true,
  staffProfile: { select: { fullName: true } },
  employeeRecord: true,
} as const;

export async function getPayrollRun(runId: string) {
  return prisma.payrollRun.findUnique({
    where: { id: runId },
    include: { payslips: { include: { user: { select: userInclude } } } },
  });
}

export async function getPayslip(runId: string, userId: string) {
  return prisma.payslip.findUnique({
    where: { payrollRunId_userId: { payrollRunId: runId, userId } },
    include: { payrollRun: true, user: { select: userInclude } },
  });
}

/** Payslips a staff member may see about themselves (approved or paid runs). */
export async function listOwnPayslips(userId: string) {
  return prisma.payslip.findMany({
    where: { userId, payrollRun: { status: { in: ["APPROVED", "PAID"] } } },
    include: { payrollRun: { select: { id: true, periodMonth: true, status: true } } },
    orderBy: { payrollRun: { periodMonth: "desc" } },
  });
}

export const BANK_CSV_COLUMNS = [
  { key: "employeeNo", label: "Employee No" },
  { key: "name", label: "Employee Name" },
  { key: "nationalId", label: "National ID / Iqama" },
  { key: "iban", label: "IBAN" },
  { key: "bank", label: "Bank" },
  { key: "basic", label: "Basic Salary" },
  { key: "housing", label: "Housing Allowance" },
  { key: "otherEarnings", label: "Other Earnings" },
  { key: "deductions", label: "Deductions" },
  { key: "net", label: "Net Amount" },
];

const sarFixed = (minor: number) => (minor / 100).toFixed(2);

/** WPS-style salary transfer rows. Only for locked (approved/paid) runs. */
export async function bankTransferRows(runId: string): Promise<{ month: string; rows: Record<string, unknown>[] }> {
  const run = await getPayrollRun(runId);
  if (!run) throw new PayrollError("Payroll run not found.");
  if (isEditable(run.status)) throw new PayrollError("Approve the run before exporting the bank file.");
  const rows = run.payslips
    .map((p) => {
      const r = p.user.employeeRecord;
      return {
        employeeNo: r?.employeeNo ?? "",
        name: p.user.staffProfile?.fullName || p.user.email || "",
        nationalId: r?.nationalId ?? "",
        iban: r?.iban ?? "",
        bank: r?.bankName ?? "",
        basic: sarFixed(p.basicMinor),
        housing: sarFixed(p.housingMinor),
        otherEarnings: sarFixed(p.transportMinor + p.otherAllowMinor + p.commissionMinor + p.overtimeMinor + p.bonusMinor),
        deductions: sarFixed(p.deductionsMinor + p.gosiEmployeeMinor),
        net: sarFixed(p.netMinor),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { month: run.periodMonth, rows };
}
