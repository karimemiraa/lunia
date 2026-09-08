// Shared "from"/"to" query-param resolution for the Report Center page
// (src/app/admin/reports/page.tsx) and its CSV export route
// (src/app/admin/reports/export/route.ts), so a malformed or missing date
// can never reach availability.ts's centerLocalToUtc -- which throws on
// anything that isn't a strict "YYYY-MM-DD" string -- and turn a
// crafted/bookmarked link like `?from=not-a-date` into an unhandled 500.
// Both callers use this one function so they can never resolve "the same"
// link to two different ranges.

import { utcToCenterLocal } from "@/modules/booking/availability";

const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ReportDateRange {
  fromISO: string;
  toISO: string;
}

/**
 * Resolves the raw `from`/`to` query-string values into validated
 * "YYYY-MM-DD" strings. A value that's missing, empty, or doesn't match
 * /^\d{4}-\d{2}-\d{2}$/ is replaced by the corresponding half of the current
 * month-to-date range in Asia/Riyadh (the 1st of the current center-local
 * month through today) -- the same default-range convention the Business
 * Dashboard's "This Month" stats use (src/app/admin/dashboard/page.tsx).
 * `from` and `to` are validated independently, so a malformed `from`
 * alongside a valid `to` only replaces `from`.
 */
export function resolveReportDateRange(
  fromParam: string | null | undefined,
  toParam: string | null | undefined,
  now: Date = new Date(),
): ReportDateRange {
  const { dateISO: todayISO } = utcToCenterLocal(now);
  const defaultFromISO = `${todayISO.slice(0, 7)}-01`;

  const from = fromParam?.trim() ?? "";
  const to = toParam?.trim() ?? "";

  return {
    fromISO: DATE_ISO_RE.test(from) ? from : defaultFromISO,
    toISO: DATE_ISO_RE.test(to) ? to : todayISO,
  };
}
