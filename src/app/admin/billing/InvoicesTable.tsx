"use client";

import { useMemo } from "react";
import { DataTable, type Column } from "../_ui/DataTable";
import { formatSar } from "../_ui/money";
import { formatDateTime } from "../_ui/dates";
import { StatusBadge } from "./ui";
import { useStaffLocale, useStaffT } from "../_i18n/StaffI18n";
import type { StaffLocale, T } from "../_i18n/t";

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

const buildColumns = (t: T, locale: StaffLocale): Column<InvoiceRowDTO>[] => [
  { key: "number", header: t("Number"), primary: true, render: (r) => (r.status === "DRAFT" ? <span className="text-[var(--color-ink)]/60">{t("Draft")}</span> : r.number) },
  {
    key: "customerName",
    header: t("Customer"),
    render: (r) => (
      <div>
        <div>{r.customerName}</div>
        {r.customerPhone && <div className="text-xs text-[var(--color-ink)]/50">{r.customerPhone}</div>}
      </div>
    ),
  },
  { key: "dateIso", header: t("Date"), value: (r) => r.dateIso, render: (r) => <span className="whitespace-nowrap">{formatDateTime(r.dateIso, locale)}</span> },
  { key: "status", header: t("Status"), value: (r) => (r.kind === "CREDIT_NOTE" ? "CREDIT_NOTE" : r.status), render: (r) => <StatusBadge status={r.status} kind={r.kind} /> },
  { key: "vatMinor", header: t("VAT"), numeric: true, render: (r) => formatSar(r.vatMinor), hideOnCard: true },
  { key: "totalMinor", header: t("Total incl. VAT"), numeric: true, value: (r) => (r.kind === "CREDIT_NOTE" ? -r.totalMinor : r.totalMinor), render: (r) => <span className="font-medium">{r.kind === "CREDIT_NOTE" ? "−" : ""}{formatSar(r.totalMinor)}</span> },
  { key: "paidMinor", header: t("Paid"), numeric: true, render: (r) => (r.kind === "INVOICE" ? formatSar(r.paidMinor) : "—") },
];

export function InvoicesTable({ rows, totals, filtered }: { rows: InvoiceRowDTO[]; totals: { totalMinor: number; vatMinor: number; paidMinor: number }; filtered: boolean }) {
  const t = useStaffT();
  const locale = useStaffLocale();
  const columns = useMemo(() => buildColumns(t, locale), [t, locale]);
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowHref={(r) => `/admin/billing/${r.id}`}
      rowActions={(r) => [
        { label: t("Open"), href: `/admin/billing/${r.id}` },
        ...(r.status !== "DRAFT" && r.status !== "VOID"
          ? [
              { label: t("Print receipt"), href: `/admin/billing/${r.id}/print?format=receipt`, external: true },
              { label: t("Print A4"), href: `/admin/billing/${r.id}/print`, external: true },
            ]
          : []),
      ]}
      initialSort={{ key: "dateIso", dir: "desc" }}
      pageSize={25}
      exportCsv="invoices"
      ariaLabel={t("Invoices")}
      footer={() => (
        <tr>
          <td className="px-4 py-3" colSpan={5}>
            {t("Totals for this filter (issued, credit notes subtracted)")}
          </td>
          <td className="px-4 py-3 text-end tabular-nums">{formatSar(totals.vatMinor)}</td>
          <td className="px-4 py-3 text-end tabular-nums">{formatSar(totals.totalMinor)}</td>
          <td className="px-4 py-3 text-end tabular-nums">{formatSar(totals.paidMinor)}</td>
        </tr>
      )}
      empty={
        filtered
          ? { title: t("No invoices match these filters"), description: t("Try a wider date range or clear the filters.") }
          : { title: t("No invoices yet"), description: t("Start a walk-in sale or check out a booking from the calendar."), action: { label: t("New sale"), href: "/admin/billing/new" } }
      }
    />
  );
}
