import { NextResponse } from "next/server";
import { requireAdmin } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { centerLocalToUtc } from "@/modules/booking/availability";
import { runReport, REPORT_TYPES, type ReportType } from "@/modules/reports/reports";
import { resolveReportDateRange } from "@/modules/reports/dateRange";
import { toCsv } from "@/modules/reports/csv";
import type { BookingStatus } from "@prisma/client";

const BOOKING_STATUSES: BookingStatus[] = ["REQUESTED", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"];

function isReportType(value: string | null): value is ReportType {
  return !!value && (REPORT_TYPES as readonly string[]).includes(value);
}

function isBookingStatus(value: string): value is BookingStatus {
  return (BOOKING_STATUSES as readonly string[]).includes(value);
}

// GET /admin/reports/export?type=<bookings|revenue|clients|marketing>&from=YYYY-MM-DD&to=YYYY-MM-DD[&status=...]
//
// Streams the same report data shown at /admin/reports as a CSV download.
// Deliberately unauthenticated/under-permissioned requests must NEVER reach
// the report-building code below: requireAdmin redirects them (to
// /admin/login, or back to /admin if they're signed in without
// ANALYTICS_VIEW) exactly as it does for every admin page, so this route can
// never leak booking/client/marketing data to the public site. Because a
// redirect response carries no CSV body, "guarded" here means the same
// thing it means everywhere else in the admin: no body ever ships to a
// caller requireAdmin would turn away.
export async function GET(request: Request) {
  await requireAdmin(PERMISSIONS.ANALYTICS_VIEW);

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const type: ReportType = isReportType(typeParam) ? typeParam : "bookings";

  // `from`/`to` are user-suppliable (a bookmarked or crafted link) and are
  // NOT validated by isReportType-style parsing before this point --
  // resolveReportDateRange is what keeps a malformed value like
  // `?from=not-a-date` from reaching centerLocalToUtc (which throws on
  // anything but "YYYY-MM-DD") and 500ing the route; it falls back to the
  // current month-to-date range instead.
  const { fromISO, toISO } = resolveReportDateRange(url.searchParams.get("from"), url.searchParams.get("to"));
  const statusParam = url.searchParams.get("status")?.trim() ?? "";
  const status = type === "bookings" && isBookingStatus(statusParam) ? statusParam : undefined;

  // Same inclusive-`to`-day convention as the admin page: the exclusive
  // upper bound passed to the report functions is the start of the day
  // AFTER `toISO`.
  const from = centerLocalToUtc(fromISO, 0);
  const to = centerLocalToUtc(toISO, 1440);

  const { columns, rows } = await runReport({ type, from, to, status });
  const csv = toCsv(columns, rows);
  const filename = `lunia-${type}-${fromISO}_${toISO}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
