"use client";

import type { Brand } from "@prisma/client";
import { DataTable, type DataTableColumn } from "../../_components/DataTable";
import { ConfirmDeleteButton } from "../../_components/ConfirmDeleteButton";
import { deleteBrandAction } from "./actions";

export function BrandsTable({ brands }: { brands: Brand[] }) {
  const columns: DataTableColumn<Brand>[] = [
    { key: "name", header: "Name", render: (b) => b.name },
    { key: "slug", header: "Slug" },
    { key: "order", header: "Order" },
    { key: "isPublished", header: "Published", render: (b) => (b.isPublished ? "Yes" : "No") },
    {
      key: "edit",
      header: "",
      render: (b) => (
        <a href={`/admin/catalog/brands/${b.id}`} className="text-sm font-medium text-[var(--color-teal)] hover:underline">
          Edit
        </a>
      ),
    },
    {
      key: "delete",
      header: "",
      render: (b) => (
        <form>
          <input type="hidden" name="id" value={b.id} />
          <ConfirmDeleteButton action={deleteBrandAction} confirmMessage={`Delete brand "${b.name}"? This cannot be undone.`} />
        </form>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={brands}
      rowKey={(b) => b.id}
      searchAccessor={(b) => `${b.name} ${b.slug}`}
      searchPlaceholder="Search brands..."
      emptyMessage="No brands yet."
    />
  );
}
