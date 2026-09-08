"use client";

import { DataTable, type DataTableColumn } from "../_components/DataTable";
import type { CommunicationLog } from "@prisma/client";

/** Asia/Riyadh is fixed at UTC+3 year-round (no DST) — see availability.ts. */
const CENTER_TZ = "Asia/Riyadh";

function formatRiyadh(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, dateStyle: "medium", timeStyle: "short" }).format(date);
}

const columns: DataTableColumn<CommunicationLog>[] = [
  { key: "channel", header: "Channel" },
  { key: "kind", header: "Kind" },
  { key: "toPhone", header: "To" },
  { key: "status", header: "Status" },
  { key: "createdAt", header: "Sent at", render: (row) => formatRiyadh(new Date(row.createdAt)) },
];

// A thin client wrapper around DataTable: the `render`/`rowKey` function
// props DataTable needs can't cross the server->client component boundary
// (Next.js RSC can't serialize functions), so this component owns them and
// only takes plain, serializable row data from the server page.
export function CommsLogTable({ rows }: { rows: CommunicationLog[] }) {
  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} emptyMessage="No messages logged yet." />;
}
