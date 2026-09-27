// Employee files: one EmployeeRecord per staff User holding identity
// documents, employment terms and pay. Also the pure leave-entitlement and
// document-expiry rules, which the leave, notification and payroll code reuse.

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  ANNUAL_LEAVE_DAYS_BASE,
  ANNUAL_LEAVE_DAYS_SENIOR,
  ANNUAL_LEAVE_SENIOR_AFTER_YEARS,
  CONTRACT_TYPES,
  DOCUMENT_WARN_DAYS,
} from "./constants";
import { addYears, dateToISO, diffDays, isDateISO, isoToDate, todayISO } from "./dates";
import { isValidSaudiIban, normalizeIban } from "./iban";

// ---------------------------------------------------------------------------
// Leave entitlement (pure)
// ---------------------------------------------------------------------------

export interface LeaveEntitlement {
  yearsOfService: number;
  /** Statutory days for this service year (21, or 30 after 5 years). */
  statutoryDays: number;
  /** Days actually granted: the statutory minimum or a better contract term. */
  annualDays: number;
  /** Current service year, [start, end) as "YYYY-MM-DD". */
  serviceYearStartISO: string;
  serviceYearEndISO: string;
  /** Entitlement earned so far this service year (pro-rated, 1 decimal). */
  accruedDays: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Annual leave for the service year containing `asOfISO`. Service years run
 * anniversary to anniversary from the hire date; with no hire date on file we
 * fall back to the calendar year. Leave accrues evenly across the year.
 */
export function leaveEntitlement(
  hireDateISO: string | null,
  asOfISO: string,
  contractDays: number = ANNUAL_LEAVE_DAYS_BASE,
): LeaveEntitlement {
  let years = 0;
  let startISO: string;
  let endISO: string;
  if (!hireDateISO) {
    startISO = `${asOfISO.slice(0, 4)}-01-01`;
    endISO = addYears(startISO, 1);
  } else if (hireDateISO > asOfISO) {
    startISO = hireDateISO;
    endISO = addYears(hireDateISO, 1);
  } else {
    while (addYears(hireDateISO, years + 1) <= asOfISO) years += 1;
    startISO = addYears(hireDateISO, years);
    endISO = addYears(hireDateISO, years + 1);
  }

  const statutoryDays = years >= ANNUAL_LEAVE_SENIOR_AFTER_YEARS ? ANNUAL_LEAVE_DAYS_SENIOR : ANNUAL_LEAVE_DAYS_BASE;
  const annualDays = Math.max(statutoryDays, contractDays);
  const yearLength = diffDays(startISO, endISO);
  const elapsed = hireDateISO && hireDateISO > asOfISO ? 0 : Math.min(diffDays(startISO, asOfISO) + 1, yearLength);

  return {
    yearsOfService: years,
    statutoryDays,
    annualDays,
    serviceYearStartISO: startISO,
    serviceYearEndISO: endISO,
    accruedDays: round1((annualDays * elapsed) / yearLength),
  };
}

// ---------------------------------------------------------------------------
// Document expiry (pure)
// ---------------------------------------------------------------------------

export type DocumentKind = "nationalId" | "passport" | "contract";
export type DocumentStatus = "expired" | "expiring";

export interface DocumentFlag {
  kind: DocumentKind;
  label: string;
  expiryISO: string;
  status: DocumentStatus;
  daysLeft: number;
}

interface ExpiryFields {
  isSaudi: boolean;
  nationalIdExpiry: Date | null;
  passportExpiry: Date | null;
  contractEnd: Date | null;
}

/** Documents already expired or expiring within DOCUMENT_WARN_DAYS. */
export function documentFlags(record: ExpiryFields, asOfISO: string = todayISO()): DocumentFlag[] {
  const docs: { kind: DocumentKind; label: string; date: Date | null }[] = [
    { kind: "nationalId", label: record.isSaudi ? "National ID" : "Iqama", date: record.nationalIdExpiry },
    { kind: "passport", label: "Passport", date: record.passportExpiry },
    { kind: "contract", label: "Contract", date: record.contractEnd },
  ];
  const flags: DocumentFlag[] = [];
  for (const doc of docs) {
    const expiryISO = dateToISO(doc.date);
    if (!expiryISO) continue;
    const daysLeft = diffDays(asOfISO, expiryISO);
    if (daysLeft < 0) flags.push({ kind: doc.kind, label: doc.label, expiryISO, status: "expired", daysLeft });
    else if (daysLeft <= DOCUMENT_WARN_DAYS) flags.push({ kind: doc.kind, label: doc.label, expiryISO, status: "expiring", daysLeft });
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function monthlyFixedPayMinor(r: {
  basicSalaryMinor: number;
  housingAllowanceMinor: number;
  transportAllowanceMinor: number;
  otherAllowanceMinor: number;
}): number {
  return r.basicSalaryMinor + r.housingAllowanceMinor + r.transportAllowanceMinor + r.otherAllowanceMinor;
}

export interface EmployeeListRow {
  userId: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  hasFile: boolean;
  employeeNo: string | null;
  jobTitle: string | null;
  department: string | null;
  nationality: string | null;
  isSaudi: boolean;
  hireDateISO: string | null;
  salaryTotalMinor: number;
  flags: DocumentFlag[];
}

/** Every staff user, with their employee file summary when one exists. */
export async function listEmployees(): Promise<EmployeeListRow[]> {
  const users = await prisma.user.findMany({
    where: { type: "STAFF" },
    include: { staffProfile: true, employeeRecord: true },
    orderBy: { createdAt: "asc" },
  });
  const asOf = todayISO();
  return users
    .map((u) => {
      const r = u.employeeRecord;
      return {
        userId: u.id,
        fullName: u.staffProfile?.fullName || u.email || "Unnamed",
        email: u.email,
        isActive: u.isActive,
        hasFile: !!r,
        employeeNo: r?.employeeNo ?? null,
        jobTitle: r?.jobTitle ?? u.staffProfile?.title ?? null,
        department: r?.department ?? null,
        nationality: r?.nationality ?? null,
        isSaudi: r?.isSaudi ?? false,
        hireDateISO: dateToISO(r?.hireDate),
        salaryTotalMinor: r ? monthlyFixedPayMinor(r) : 0,
        flags: r ? documentFlags(r, asOf) : [],
      };
    })
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.fullName.localeCompare(b.fullName));
}

export async function getEmployeeFile(userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, type: "STAFF" },
    include: { staffProfile: true, employeeRecord: true },
  });
}

/** Display name for a staff user id (full name, else email). */
export async function staffNames(userIds: string[]): Promise<Map<string, string>> {
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(userIds)] } },
    select: { id: true, email: true, staffProfile: { select: { fullName: true } } },
  });
  return new Map(users.map((u) => [u.id, u.staffProfile?.fullName || u.email || u.id]));
}

// ---------------------------------------------------------------------------
// Save (validated from the admin form)
// ---------------------------------------------------------------------------

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const optDate = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || isDateISO(v), "Use a valid date")
  .transform((v) => (v ? isoToDate(v) : null));

// Accepts "12,500" or "12500.50" riyals and stores halalas.
const sarAmount = z
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

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

export const employeeRecordSchema = z.object({
  employeeNo: optText(40),
  nationality: optText(60),
  isSaudi: checkbox,
  nationalId: optText(20).refine((v) => !v || /^\d{10}$/.test(v), "National ID / iqama number must be 10 digits"),
  nationalIdExpiry: optDate,
  passportNo: optText(20),
  passportExpiry: optDate,
  jobTitle: optText(80),
  department: optText(80),
  hireDate: optDate,
  contractType: z
    .enum(CONTRACT_TYPES)
    .or(z.literal(""))
    .optional()
    .transform((v) => (v ? v : null)),
  contractEnd: optDate,
  basicSalaryMinor: sarAmount,
  housingAllowanceMinor: sarAmount,
  transportAllowanceMinor: sarAmount,
  otherAllowanceMinor: sarAmount,
  // Entered as a percentage (e.g. "5" or "2.5"), stored as basis points.
  commissionPct: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return 0;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        ctx.addIssue({ code: "custom", message: "Commission must be between 0 and 100%" });
        return z.NEVER;
      }
      return Math.round(n * 100);
    }),
  gosiApplicable: checkbox,
  iban: z
    .string()
    .optional()
    .transform((v) => (v ? normalizeIban(v) : null))
    .refine((v) => !v || isValidSaudiIban(v), "Enter a valid Saudi IBAN (SA + 22 digits)"),
  bankName: optText(80),
  annualLeaveDays: z.coerce.number().int().min(ANNUAL_LEAVE_DAYS_BASE, `At least ${ANNUAL_LEAVE_DAYS_BASE} days (Labor Law minimum)`).max(60).default(ANNUAL_LEAVE_DAYS_BASE),
  emergencyContact: optText(200),
  notes: optText(4000),
});

export type EmployeeRecordInput = z.input<typeof employeeRecordSchema>;

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveEmployeeRecord(userId: string, input: EmployeeRecordInput): Promise<SaveResult> {
  const user = await prisma.user.findFirst({ where: { id: userId, type: "STAFF" }, select: { id: true } });
  if (!user) return { ok: false, error: "Staff member not found." };

  const parsed = employeeRecordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { commissionPct, ...rest } = parsed.data;
  const data = { ...rest, commissionBp: commissionPct };

  try {
    await prisma.employeeRecord.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "That employee number is already used by someone else." };
    }
    throw err;
  }
  return { ok: true };
}
