"use client";

import type { Department, Service } from "@prisma/client";
import { DataTable, type DataTableColumn } from "../../_components/DataTable";
import { ConfirmDeleteButton } from "../../_components/ConfirmDeleteButton";
import { deleteServiceAction } from "./actions";

interface ServicesTableProps {
  services: Service[];
  departmentsById: Record<string, Department>;
}

export function ServicesTable({ services, departmentsById }: ServicesTableProps) {
  const columns: DataTableColumn<Service>[] = [
    { key: "nameEn", header: "Name", render: (s) => s.nameEn },
    { key: "department", header: "Department", render: (s) => departmentsById[s.departmentId]?.nameEn ?? "—" },
    { key: "slug", header: "Slug" },
    { key: "order", header: "Order" },
    { key: "isPublished", header: "Published", render: (s) => (s.isPublished ? "Yes" : "No") },
    {
      key: "edit",
      header: "",
      render: (s) => (
        <a href={`/admin/catalog/services/${s.id}`} className="text-sm font-medium text-[var(--color-teal)] hover:underline">
          Edit
        </a>
      ),
    },
    {
      key: "delete",
      header: "",
      render: (s) => (
        <form>
          <input type="hidden" name="id" value={s.id} />
          <ConfirmDeleteButton
            action={deleteServiceAction}
            confirmMessage={`Delete service "${s.nameEn}"? This cannot be undone.`}
          />
        </form>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={services}
      rowKey={(s) => s.id}
      searchAccessor={(s) => `${s.nameEn} ${s.slug}`}
      searchPlaceholder="Search services..."
      emptyMessage="No services yet."
    />
  );
}
