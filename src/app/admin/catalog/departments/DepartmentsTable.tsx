"use client";

import type { Department } from "@prisma/client";
import { DataTable, type DataTableColumn } from "../../_components/DataTable";
import { ConfirmDeleteButton } from "../../_components/ConfirmDeleteButton";
import { deleteDepartmentAction } from "./actions";

export function DepartmentsTable({ departments }: { departments: Department[] }) {
  const columns: DataTableColumn<Department>[] = [
    { key: "nameEn", header: "Name", render: (d) => d.nameEn },
    { key: "slug", header: "Slug" },
    { key: "order", header: "Order" },
    { key: "isPublished", header: "Published", render: (d) => (d.isPublished ? "Yes" : "No") },
    {
      key: "edit",
      header: "",
      render: (d) => (
        <a href={`/admin/catalog/departments/${d.id}`} className="text-sm font-medium text-[var(--color-teal)] hover:underline">
          Edit
        </a>
      ),
    },
    {
      key: "delete",
      header: "",
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
      searchAccessor={(d) => `${d.nameEn} ${d.slug}`}
      searchPlaceholder="Search departments..."
      emptyMessage="No departments yet."
    />
  );
}
