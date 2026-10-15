"use client";

import type { Brand } from "@prisma/client";
import { DataTable, type Column } from "../../_ui/DataTable";
import { useStaffT } from "../../_i18n/StaffI18n";
import { ConfirmDeleteButton } from "../../_components/ConfirmDeleteButton";
import { deleteBrandAction } from "./actions";

export function BrandsTable({ brands }: { brands: Brand[] }) {
  const t = useStaffT();
  const columns: Column<Brand>[] = [
    { key: "name", header: t("Name"), primary: true, value: (b) => b.name, render: (b) => b.name },
    { key: "slug", header: t("Slug"), value: (b) => b.slug },
    { key: "order", header: t("Order"), numeric: true, value: (b) => b.order },
    { key: "isPublished", header: t("Published"), value: (b) => (b.isPublished ? t("Yes") : t("No")) },
    {
      key: "edit",
      header: "",
      sortable: false,
      render: (b) => (
        <a href={`/admin/catalog/brands/${b.id}`} className="text-sm font-medium text-[var(--color-teal)] hover:underline">
          {t("Edit")}
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
          <ConfirmDeleteButton action={deleteBrandAction} confirmMessage={t('Delete brand "{name}"? This cannot be undone.', { name: b.name })} />
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
      searchPlaceholder={t("Search brands...")}
      empty={t("No brands yet.")}
      ariaLabel={t("Brands")}
    />
  );
}
