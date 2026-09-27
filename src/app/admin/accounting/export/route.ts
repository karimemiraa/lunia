import { NextResponse } from "next/server";
import { requireAccounting } from "../_components/access";
import { toCsv } from "@/modules/reports/csv";
import { resolveAccountingRange, addMonthsToMonthKey, rangeFromISO } from "@/modules/accounting/periods";
import {
  accountingDashboard,
  dashboardCsv,
  pnlCsv,
  profitAndLoss,
  receivablesAging,
  receivablesCsv,
  salesAnalysis,
  salesCsv,
  vatCsv,
  vatSummary,
  type CsvTable,
} from "@/modules/accounting/reports";
import { EXPENSE_CSV_COLUMNS, expenseCsvRows, listExpenses } from "@/modules/accounting/expenses";
import { parseExpenseFilterParams } from "../expenses/filters";

const REPORTS = ["overview", "pnl", "vat", "sales", "receivables", "expenses"] as const;
type Report = (typeof REPORTS)[number];

// GET /admin/accounting/export?report=<overview|pnl|vat|sales|receivables|expenses>&from=YYYY-MM-DD&to=YYYY-MM-DD[&period=month|quarter]
//
// Same data as the accounting screens, as CSV. requireAccounting redirects
// anyone without accounting:manage before any figure is computed.
export async function GET(request: Request) {
  await requireAccounting();

  const url = new URL(request.url);
  const reportParam = url.searchParams.get("report");
  const report: Report = (REPORTS as readonly string[]).includes(reportParam ?? "") ? (reportParam as Report) : "overview";
  const range = resolveAccountingRange(url.searchParams.get("from"), url.searchParams.get("to"));

  let table: CsvTable;
  let suffix = `${range.fromISO}_${range.toISO}`;
  switch (report) {
    case "pnl":
      table = pnlCsv(await profitAndLoss(range));
      break;
    case "vat":
      table = vatCsv(await vatSummary(range, url.searchParams.get("period") === "month" ? "month" : "quarter"));
      break;
    case "sales":
      table = salesCsv(await salesAnalysis(range));
      break;
    case "receivables": {
      const now = new Date();
      table = receivablesCsv(await receivablesAging(now));
      suffix = `as-of-${now.toISOString().slice(0, 10)}`;
      break;
    }
    case "expenses": {
      const filter = parseExpenseFilterParams(url.searchParams);
      const { rows } = await listExpenses(filter);
      table = { columns: EXPENSE_CSV_COLUMNS, rows: expenseCsvRows(rows) };
      suffix = `${filter.range.fromISO}_${filter.range.toISO}`;
      break;
    }
    default: {
      const trendRange = rangeFromISO(`${addMonthsToMonthKey(range.toISO.slice(0, 7), -5)}-01`, range.toISO);
      table = dashboardCsv(await accountingDashboard(range, trendRange));
    }
  }

  return new NextResponse(toCsv(table.columns, table.rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lunia-${report}-${suffix}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
