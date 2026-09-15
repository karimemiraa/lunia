"use client";

import type { ContactInquiry } from "@prisma/client";
import { DataTable, type DataTableColumn } from "../_components/DataTable";
import { setHandledAction } from "./actions";

export function InquiriesTable({ inquiries }: { inquiries: ContactInquiry[] }) {
  const columns: DataTableColumn<ContactInquiry>[] = [
    { key: "name", header: "Name" },
    { key: "phone", header: "Phone" },
    { key: "message", header: "Message", render: (i) => <span className="line-clamp-2 max-w-sm">{i.message}</span> },
    { key: "locale", header: "Locale", render: (i) => i.locale.toUpperCase() },
    { key: "sourcePage", header: "Source page", render: (i) => i.sourcePage ?? "None" },
    { key: "createdAt", header: "Received", render: (i) => new Date(i.createdAt).toLocaleString() },
    {
      key: "handled",
      header: "Handled",
      render: (i) => (
        <form>
          <input type="hidden" name="id" value={i.id} />
          <input type="hidden" name="handled" value={i.handled ? "false" : "true"} />
          <button
            type="submit"
            formAction={setHandledAction}
            className={
              i.handled
                ? "rounded border border-[var(--color-ink)]/20 px-3 py-1.5 text-xs font-medium text-[var(--color-ink)]/70 hover:bg-[var(--color-cream)]/40"
                : "lunia-btn lunia-btn-primary lunia-btn-sm"
            }
          >
            {i.handled ? "Mark unhandled" : "Mark handled"}
          </button>
        </form>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={inquiries}
      rowKey={(i) => i.id}
      searchAccessor={(i) => `${i.name} ${i.phone} ${i.message}`}
      searchPlaceholder="Search inquiries..."
      emptyMessage="No inquiries yet."
    />
  );
}
