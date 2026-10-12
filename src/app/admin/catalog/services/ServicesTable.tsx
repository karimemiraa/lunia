"use client";

import type { Department, Service } from "@prisma/client";
import { DataTable, type Column } from "../../_ui/DataTable";
import { ConfirmDeleteButton } from "../../_components/ConfirmDeleteButton";
import { deleteServiceAction } from "./actions";

interface ServicesTableProps {
  services: Service[];
  departmentsById: Record<string, Department>;
}

export function ServicesTable({ services, departmentsById }: ServicesTableProps) {
  const columns: Column<Service>[] = [
    { key: "nameEn", header: "Name", primary: true, value: (s) => s.nameEn, render: (s) => s.nameEn },
    { key: "department", header: "Department", value: (s) => departmentsById[s.departmentId]?.nameEn ?? "None" },
    { key: "slug", header: "Slug", value: (s) => s.slug },
    { key: "order", header: "Order", numeric: true, value: (s) => s.order },
    { key: "isPublished", header: "Published", value: (s) => (s.isPublished ? "Yes" : "No") },
    {
      key: "edit",
      header: "",
      sortable: false,
      render: (s) => (
        <a href={`/admin/catalog/services/${s.id}`} className="text-sm font-medium text-[var(--color-teal)] hover:underline">
          Edit
        </a>
      ),
    },
    {
      key: "delete",
      header: "",
      sortable: false,
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
      initialSort={{ key: "nameEn", dir: "asc" }}
      search={(s) => `${s.nameEn} ${s.slug}`}
      searchPlaceholder="Search services..."
      empty="No services yet."
      ariaLabel="Services"
    />
  );
}
