import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { toCsv } from "@/modules/reports/csv";
import { BANK_CSV_COLUMNS, PayrollError, bankTransferRows } from "@/modules/hr/payroll";

// GET /admin/hr/payroll/<runId>/bank -> WPS-style salary transfer CSV for an
// approved or paid run (employee, national ID/iqama, IBAN, bank, net).
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  await requireAdmin(PERMISSIONS.HR_MANAGE);
  const { runId } = await params;
  try {
    const { month, rows } = await bankTransferRows(runId);
    return new NextResponse(`﻿${toCsv(BANK_CSV_COLUMNS, rows)}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="lunia-salaries-${month}.csv"`,
      },
    });
  } catch (err) {
    if (err instanceof PayrollError) return new NextResponse(err.message, { status: 409 });
    throw err;
  }
}
