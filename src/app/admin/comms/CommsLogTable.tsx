"use client";

import { DataTable, type DataTableColumn } from "../_components/DataTable";
import type { CommunicationLog } from "@prisma/client";
import { CHANNEL_LABELS, KIND_META } from "@/modules/comms/templateCatalog";
import { useStaffLocale, useStaffT } from "../_i18n/StaffI18n";
import { intlLocale, type StaffLocale } from "../_i18n/t";

/** Asia/Riyadh is fixed at UTC+3 year-round (no DST) — see availability.ts. */
const CENTER_TZ = "Asia/Riyadh";

const STATUS_LABELS: Record<string, string> = { SENT: "Sent", FAILED: "Failed" };

function formatRiyadh(date: Date, locale: StaffLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale, "en-US"), { timeZone: CENTER_TZ, dateStyle: "medium", timeStyle: "short" }).format(date);
}

// A thin client wrapper around DataTable: the `render`/`rowKey` function
// props DataTable needs can't cross the server->client component boundary
// (Next.js RSC can't serialize functions), so this component owns them and
// only takes plain, serializable row data from the server page.
export function CommsLogTable({ rows }: { rows: CommunicationLog[] }) {
  const t = useStaffT();
  const locale = useStaffLocale();
  // English shows the raw stored values (as before); Arabic shows labels.
  const label = (value: string, labels: Record<string, string>) => (locale === "ar" ? t(labels[value] ?? value) : value);
  const kindLabels = Object.fromEntries(Object.entries(KIND_META).map(([k, m]) => [k, m.label]));
  const columns: DataTableColumn<CommunicationLog>[] = [
    { key: "channel", header: t("Channel"), render: (row) => label(row.channel, CHANNEL_LABELS) },
    { key: "kind", header: t("Kind"), render: (row) => label(row.kind, kindLabels) },
    { key: "toPhone", header: t("To"), render: (row) => <span dir="ltr">{row.toPhone}</span> },
    { key: "status", header: t("Status"), render: (row) => label(row.status, STATUS_LABELS) },
    { key: "createdAt", header: t("Sent at"), render: (row) => formatRiyadh(new Date(row.createdAt), locale) },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} emptyMessage={t("No messages logged yet.")} />;
}
