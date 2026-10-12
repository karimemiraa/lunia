"use client";

import type { Department } from "@prisma/client";
import { DataTable, type Column } from "../../_ui/DataTable";
import { ConfirmDeleteButton } from "../../_components/ConfirmDeleteButton";
import { deleteDepartmentAction } from "./actions";

export function DepartmentsTable({ departments }: { departments: Department[] }) {
  const columns: Column<Department>[] = [
    { key: "nameEn", header: "Name", primary: true, value: (d) => d.nameEn, render: (d) => d.nameEn },
    { key: "slug", header: "Slug", value: (d) => d.slug },
    { key: "order", header: "Order", numeric: true, value: (d) => d.order },
    { key: "isPublished", header: "Published", value: (d) => (d.isPublished ? "Yes" : "No") },
    {
      key: "edit",
      header: "",
      sortable: false,
      render: (d) => (
        <a href={`/admin/catalog/departments/${d.id}`} className="text-sm font-medium text-[var(--color-teal)] hover:underline">
          Edit
        </a>
      ),
    },
    {
      key: "delete",
      header: "",
      sortable: false,
      render: (d) => (
        <form>
          <input type="hidden" name="id" value={d.id} />
          <ConfirmDeleteButton
            action={deleteDepartmentAction}
            confirmMessage={`Delete department "${d.nameEn}"? Its services will be deleted too. This cannot be undone.`}
          />
        </form>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={departments}
      rowKey={(d) => d.id}
      initialSort={{ key: "order", dir: "asc" }}
      search={(d) => `${d.nameEn} ${d.slug}`}
      searchPlaceholder="Search departments..."
      empty="No departments yet."
      ariaLabel="Departments"
    />
  );
}
