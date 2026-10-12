"use client";

import type { Brand } from "@prisma/client";
import { DataTable, type Column } from "../../_ui/DataTable";
import { ConfirmDeleteButton } from "../../_components/ConfirmDeleteButton";
import { deleteBrandAction } from "./actions";

export function BrandsTable({ brands }: { brands: Brand[] }) {
  const columns: Column<Brand>[] = [
    { key: "name", header: "Name", primary: true, value: (b) => b.name, render: (b) => b.name },
    { key: "slug", header: "Slug", value: (b) => b.slug },
    { key: "order", header: "Order", numeric: true, value: (b) => b.order },
    { key: "isPublished", header: "Published", value: (b) => (b.isPublished ? "Yes" : "No") },
    {
      key: "edit",
      header: "",
      sortable: false,
      render: (b) => (
        <a href={`/admin/catalog/brands/${b.id}`} className="text-sm font-medium text-[var(--color-teal)] hover:underline">
          Edit
        </a>
      ),
    },
    {
      key: "delete",
      header: "",
      sortable: false,
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
      initialSort={{ key: "order", dir: "asc" }}
      search={(b) => `${b.name} ${b.slug}`}
      searchPlaceholder="Search brands..."
      empty="No brands yet."
      ariaLabel="Brands"
    />
  );
}
