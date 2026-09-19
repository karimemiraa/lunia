"use client";

import Link from "next/link";
import type { ContactInquiry } from "@prisma/client";
import { DataTable, type DataTableColumn } from "../_components/DataTable";
import { setHandledAction } from "./actions";

export function InquiriesTable({ inquiries }: { inquiries: ContactInquiry[] }) {
  const columns: DataTableColumn<ContactInquiry>[] = [
    {
      key: "name",
      header: "Name",
      render: (i) => (
        <Link href={`/admin/inquiries/${i.id}`} className="font-medium text-[var(--color-ink)] hover:text-[var(--color-teal-ink)] hover:underline">
          {i.name}
        </Link>
      ),
    },
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
                ? "lunia-btn lunia-btn-forest-outline lunia-btn-sm"
                : "lunia-btn lunia-btn-forest lunia-btn-sm"
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
