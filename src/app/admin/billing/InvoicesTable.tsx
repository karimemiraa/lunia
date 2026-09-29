"use client";

import { DataTable, type Column } from "../_ui/DataTable";
import { formatSar } from "../_ui/money";
import { formatDateTime } from "../_ui/dates";
import { StatusBadge } from "./ui";

export interface InvoiceRowDTO {
  id: string;
  number: string;
  kind: string;
  status: string;
  customerName: string;
  customerPhone: string | null;
  dateIso: string;
  totalMinor: number;
  vatMinor: number;
  paidMinor: number;
}

const columns: Column<InvoiceRowDTO>[] = [
  { key: "number", header: "Number", primary: true, render: (r) => (r.status === "DRAFT" ? <span className="text-[var(--color-ink)]/60">Draft</span> : r.number) },
  {
    key: "customerName",
    header: "Customer",
    render: (r) => (
      <div>
        <div>{r.customerName}</div>
        {r.customerPhone && <div className="text-xs text-[var(--color-ink)]/50">{r.customerPhone}</div>}
      </div>
    ),
  },
  { key: "dateIso", header: "Date", value: (r) => r.dateIso, render: (r) => <span className="whitespace-nowrap">{formatDateTime(r.dateIso)}</span> },
  { key: "status", header: "Status", value: (r) => (r.kind === "CREDIT_NOTE" ? "CREDIT_NOTE" : r.status), render: (r) => <StatusBadge status={r.status} kind={r.kind} /> },
  { key: "vatMinor", header: "VAT", numeric: true, render: (r) => formatSar(r.vatMinor), hideOnCard: true },
  { key: "totalMinor", header: "Total incl. VAT", numeric: true, value: (r) => (r.kind === "CREDIT_NOTE" ? -r.totalMinor : r.totalMinor), render: (r) => <span className="font-medium">{r.kind === "CREDIT_NOTE" ? "−" : ""}{formatSar(r.totalMinor)}</span> },
  { key: "paidMinor", header: "Paid", numeric: true, render: (r) => (r.kind === "INVOICE" ? formatSar(r.paidMinor) : "—") },
];

export function InvoicesTable({ rows, totals, filtered }: { rows: InvoiceRowDTO[]; totals: { totalMinor: number; vatMinor: number; paidMinor: number }; filtered: boolean }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowHref={(r) => `/admin/billing/${r.id}`}
      rowActions={(r) => [
        { label: "Open", href: `/admin/billing/${r.id}` },
        ...(r.status !== "DRAFT" && r.status !== "VOID"
          ? [
              { label: "Print receipt", href: `/admin/billing/${r.id}/print?format=receipt`, external: true },
              { label: "Print A4", href: `/admin/billing/${r.id}/print`, external: true },
            ]
          : []),
      ]}
      initialSort={{ key: "dateIso", dir: "desc" }}
      pageSize={25}
      exportCsv="invoices"
      ariaLabel="Invoices"
      footer={() => (
        <tr>
          <td className="px-4 py-3" colSpan={5}>
            Totals for this filter (issued, credit notes subtracted)
          </td>
          <td className="px-4 py-3 text-end tabular-nums">{formatSar(totals.vatMinor)}</td>
          <td className="px-4 py-3 text-end tabular-nums">{formatSar(totals.totalMinor)}</td>
          <td className="px-4 py-3 text-end tabular-nums">{formatSar(totals.paidMinor)}</td>
        </tr>
      )}
      empty={
        filtered
          ? { title: "No invoices match these filters", description: "Try a wider date range or clear the filters." }
          : { title: "No invoices yet", description: "Start a walk-in sale or check out a booking from the calendar.", action: { label: "New sale", href: "/admin/billing/new" } }
      }
    />
  );
}
