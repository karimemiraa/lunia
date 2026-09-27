// HR & payroll constants for a Saudi employer. Rates change by regulation, so
// they all live here; update the "as of" date whenever a value is revised.

/**
 * GOSI (General Organization for Social Insurance) contribution rates, in
 * basis points of the contribution base (basic + housing), as of 2026-09.
 * Saudi nationals: annuities 9% + SANED (unemployment) 0.75% from each side,
 * plus 2% occupational hazards paid by the employer only.
 * Non-Saudis: occupational hazards only (2%, employer).
 * Note: the 2024 reform phases annuities up for employees hired from
 * 2024-07-03; revisit these values when that schedule starts to bite.
 */
export const GOSI_RATES_AS_OF = "2026-09-27";
export const GOSI_RATES_BP = {
  saudi: { employee: 975, employer: 1175 },
  nonSaudi: { employee: 0, employer: 200 },
} as const;

/** Monthly contribution base cap: SAR 45,000 (in halalas). */
export const GOSI_BASE_CAP_MINOR = 45_000_00;

/** Saudi practice: daily wage = monthly wage / 30 (used for unpaid-leave deductions). */
export const PAYROLL_DAYS_PER_MONTH = 30;

/**
 * Saudi Labor Law, Article 109: 21 days paid annual leave, rising to 30 days
 * once the employee completes five years of continuous service.
 */
export const ANNUAL_LEAVE_DAYS_BASE = 21;
export const ANNUAL_LEAVE_DAYS_SENIOR = 30;
export const ANNUAL_LEAVE_SENIOR_AFTER_YEARS = 5;

/** A clock-in more than this many minutes after the scheduled start is "late". */
export const LATE_GRACE_MIN = 10;

/** Documents (iqama / passport / contract) expiring within this window are flagged. */
export const DOCUMENT_WARN_DAYS = 60;

/** Longest single leave request we accept, to catch typos in the year. */
export const MAX_LEAVE_REQUEST_DAYS = 120;

export const LEAVE_TYPES = ["ANNUAL", "SICK", "UNPAID", "OTHER"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  ANNUAL: "Annual",
  SICK: "Sick",
  UNPAID: "Unpaid",
  OTHER: "Other",
};

export const CONTRACT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACTOR"] as const;
export const CONTRACT_TYPE_LABELS: Record<(typeof CONTRACT_TYPES)[number], string> = {
  FULL_TIME: "Full time",
  PART_TIME: "Part time",
  CONTRACTOR: "Contractor",
};

export const PAYROLL_STATUSES = ["DRAFT", "APPROVED", "PAID"] as const;
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];
