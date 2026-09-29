// The one money formatter for staff screens. Halalas in, "1,234.50 SAR" out.
// Wraps the billing module's formatter so invoices, payroll, expenses and
// KPIs all print the same way (two decimals, Latin digits, tabular-nums via
// the caller's class).
import { formatAmount, formatSarMinor, parseSarToMinor } from "@/modules/billing/money";

export { formatAmount, parseSarToMinor };

/** "1,234.50 SAR" */
export function formatSar(minor: number): string {
  return formatSarMinor(minor);
}

/** "SAR 1,234.50" → for compact KPI tiles where the unit leads. */
export function formatSarLead(minor: number): string {
  return `SAR ${formatAmount(minor)}`;
}

/** Halalas → decimal string for an input's defaultValue ("" for zero). */
export function minorToInput(minor: number | null | undefined): string {
  if (!minor) return "";
  return (minor / 100).toFixed(2).replace(/\.00$/, "");
}

/** Signed with an explicit minus and no unit: "-250.00". */
export function formatSigned(minor: number): string {
  return formatAmount(minor);
}

/** Percentage from basis points: 1500 → "15%". */
export function formatPercentBp(bp: number): string {
  const pct = bp / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}
