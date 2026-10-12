"use client";

import Link from "next/link";
import type { ContactInquiry } from "@prisma/client";
import { DataTable, type Column } from "../_ui/DataTable";
import { setHandledAction } from "./actions";

export function InquiriesTable({ inquiries }: { inquiries: ContactInquiry[] }) {
  const columns: Column<ContactInquiry>[] = [
    {
      key: "name",
      header: "Name",
      primary: true,
      value: (i) => i.name,
      render: (i) => (
        <Link href={`/admin/inquiries/${i.id}`} className="font-medium text-[var(--color-ink)] hover:text-[var(--color-teal-ink)] hover:underline">
          {i.name}
        </Link>
      ),
    },
    { key: "phone", header: "Phone", value: (i) => i.phone },
    { key: "message", header: "Message", sortable: false, render: (i) => <span className="line-clamp-2 max-w-sm">{i.message}</span> },
    { key: "locale", header: "Locale", value: (i) => i.locale.toUpperCase() },
    { key: "sourcePage", header: "Source page", value: (i) => i.sourcePage ?? "None" },
    { key: "createdAt", header: "Received", value: (i) => new Date(i.createdAt), render: (i) => new Date(i.createdAt).toLocaleString() },
    {
      key: "handled",
      header: "Handled",
      value: (i) => (i.handled ? "Yes" : "No"),
      render: (i) => (
        <form>
          <input type="hidden" name="id" value={i.id} />
          <input type="hidden" name="handled" value={i.handled ? "false" : "true"} />
          <button
            type="submit"
            formAction={setHandledAction}
            className={i.handled ? "lunia-btn lunia-btn-forest-outline lunia-btn-sm" : "lunia-btn lunia-btn-forest lunia-btn-sm"}
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
      initialSort={{ key: "createdAt", dir: "desc" }}
      search={(i) => `${i.name} ${i.phone} ${i.message}`}
      searchPlaceholder="Search inquiries..."
      empty="No inquiries yet."
      ariaLabel="Contact inquiries"
    />
  );
}
