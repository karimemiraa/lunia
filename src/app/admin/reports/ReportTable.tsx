"use client";

import { DataTable, type Column, type CellValue } from "../_ui/DataTable";
import type { ReportColumn } from "@/modules/reports/reports";

interface ReportRowWithKey {
  __key: string;
  [key: string]: unknown;
}

interface ReportTableProps {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
}

/**
 * Thin client wrapper around the shared admin DataTable: report columns/rows
 * are plain, fully-computed data from the server (see reports.ts), so this
 * component only translates {key,label} columns into the DataTable column
 * shape and gives each row a stable React key. Reports have no natural row id,
 * so rows are keyed by their position in the (already server-sorted) result.
 * The header-level sort/paging below is purely presentational; CSV export is
 * handled by the page's own range-aware export link, not DataTable.
 */
export function ReportTable({ columns, rows }: ReportTableProps) {
  const dataTableColumns: Column<ReportRowWithKey>[] = columns.map((column, index) => ({
    key: column.key,
    header: column.label,
    primary: index === 0,
    value: (row) => (row[column.key] ?? "") as CellValue,
  }));

  const keyedRows: ReportRowWithKey[] = rows.map((row, index) => ({ ...row, __key: String(index) }));

  return (
    <div data-testid="reports-table">
      <DataTable
        columns={dataTableColumns}
        rows={keyedRows}
        rowKey={(row) => row.__key}
        cards={false}
        search={(row) => columns.map((column) => String(row[column.key] ?? "")).join(" ")}
        searchPlaceholder="Search rows..."
        empty="No rows for this report and range."
        ariaLabel="Report rows"
      />
    </div>
  );
}
