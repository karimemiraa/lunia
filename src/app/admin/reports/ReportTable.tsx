"use client";

import { DataTable, type DataTableColumn } from "../_components/DataTable";
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
 * component only needs to translate {key,label} columns into DataTable's
 * {key,header} shape and give each row a stable React key. Reports have no
 * natural row id, so rows are keyed by their position in the (already
 * server-sorted) result.
 */
export function ReportTable({ columns, rows }: ReportTableProps) {
  const dataTableColumns: DataTableColumn<ReportRowWithKey>[] = columns.map((column) => ({
    key: column.key,
    header: column.label,
  }));

  const keyedRows: ReportRowWithKey[] = rows.map((row, index) => ({ ...row, __key: String(index) }));

  return (
    <div data-testid="reports-table">
      <DataTable
        columns={dataTableColumns}
        rows={keyedRows}
        rowKey={(row) => row.__key}
        searchAccessor={(row) => columns.map((column) => String(row[column.key] ?? "")).join(" ")}
        searchPlaceholder="Search rows..."
        emptyMessage="No rows for this report and range."
      />
    </div>
  );
}
