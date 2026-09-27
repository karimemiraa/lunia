import { NextResponse } from "next/server";
import { requireAdmin } from "../../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { toCsv } from "@/modules/reports/csv";
import { ATTENDANCE_CSV_COLUMNS, attendanceCsvRows } from "@/modules/hr/attendance";
import { isMonthISO, todayISO } from "@/modules/hr/dates";

// GET /admin/hr/attendance/export?month=YYYY-MM -> every clock record of the
// month as CSV. requireAdmin redirects anyone without hr:manage before any
// data is read.
export async function GET(request: Request) {
  await requireAdmin(PERMISSIONS.HR_MANAGE);
  const param = new URL(request.url).searchParams.get("month") ?? "";
  const month = isMonthISO(param) ? param : todayISO().slice(0, 7);
  const csv = toCsv(ATTENDANCE_CSV_COLUMNS, await attendanceCsvRows(month));
  return new NextResponse(`﻿${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lunia-attendance-${month}.csv"`,
    },
  });
}
