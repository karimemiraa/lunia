"use client";

import type { Department, Service } from "@prisma/client";
import { DataTable, type Column } from "../../_ui/DataTable";
import { useStaffLocale, useStaffT } from "../../_i18n/StaffI18n";
import { ConfirmDeleteButton } from "../../_components/ConfirmDeleteButton";
import { deleteServiceAction } from "./actions";

interface ServicesTableProps {
  services: Service[];
  departmentsById: Record<string, Department>;
}

export function ServicesTable({ services, departmentsById }: ServicesTableProps) {
  const t = useStaffT();
  const locale = useStaffLocale();
  const columns: Column<Service>[] = [
    { key: "nameEn", header: t("Name"), primary: true, value: (s) => s.nameEn, render: (s) => (locale === "ar" && s.nameAr ? s.nameAr : s.nameEn) },
    {
      key: "department",
      header: t("Department"),
      value: (s) => {
        const d = departmentsById[s.departmentId];
        return d ? (locale === "ar" && d.nameAr ? d.nameAr : d.nameEn) : t("None");
      },
    },
    { key: "slug", header: t("Slug"), value: (s) => s.slug },
    { key: "order", header: t("Order"), numeric: true, value: (s) => s.order },
    { key: "isPublished", header: t("Published"), value: (s) => (s.isPublished ? t("Yes") : t("No")) },
    {
      key: "edit",
      header: "",
      sortable: false,
      render: (s) => (
        <a href={`/admin/catalog/services/${s.id}`} className="text-sm font-medium text-[var(--color-teal)] hover:underline">
          {t("Edit")}
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
            confirmMessage={t('Delete service "{name}"? This cannot be undone.', { name: locale === "ar" && s.nameAr ? s.nameAr : s.nameEn })}
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
      searchPlaceholder={t("Search services...")}
      empty={t("No services yet.")}
      ariaLabel={t("Services")}
    />
  );
}
