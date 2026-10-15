"use client";

import type { Department } from "@prisma/client";
import { DataTable, type Column } from "../../_ui/DataTable";
import { useStaffLocale, useStaffT } from "../../_i18n/StaffI18n";
import { ConfirmDeleteButton } from "../../_components/ConfirmDeleteButton";
import { deleteDepartmentAction } from "./actions";

export function DepartmentsTable({ departments }: { departments: Department[] }) {
  const t = useStaffT();
  const locale = useStaffLocale();
  const columns: Column<Department>[] = [
    { key: "nameEn", header: t("Name"), primary: true, value: (d) => d.nameEn, render: (d) => (locale === "ar" && d.nameAr ? d.nameAr : d.nameEn) },
    { key: "slug", header: t("Slug"), value: (d) => d.slug },
    { key: "order", header: t("Order"), numeric: true, value: (d) => d.order },
    { key: "isPublished", header: t("Published"), value: (d) => (d.isPublished ? t("Yes") : t("No")) },
    {
      key: "edit",
      header: "",
      sortable: false,
      render: (d) => (
        <a href={`/admin/catalog/departments/${d.id}`} className="text-sm font-medium text-[var(--color-teal)] hover:underline">
          {t("Edit")}
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
            confirmMessage={t('Delete department "{name}"? Its services will be deleted too. This cannot be undone.', { name: locale === "ar" && d.nameAr ? d.nameAr : d.nameEn })}
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
      searchPlaceholder={t("Search departments...")}
      empty={t("No departments yet.")}
      ariaLabel={t("Departments")}
    />
  );
}
