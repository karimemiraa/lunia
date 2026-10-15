"use client";

import Link from "next/link";
import { DataTable, type Column } from "../_ui/DataTable";
import { formatSarMinor } from "@/modules/inventory/money";
import { useStaffLocale, useStaffT } from "../_i18n/StaffI18n";
import { Badge, KIND_LABELS, productName, qtyUnit } from "./_components/ui";

export interface ProductRow {
  id: string;
  nameEn: string;
  nameAr?: string | null;
  brandName: string | null;
  sku: string | null;
  category: string | null;
  kind: string;
  stockQty: number;
  unit: string;
  reorderLevel: number;
  costMinor: number;
  priceMinor: number | null;
  isActive: boolean;
}

function isLow(p: ProductRow): boolean {
  return p.stockQty < 0 || (p.reorderLevel > 0 && p.stockQty <= p.reorderLevel);
}

/**
 * The products list on the shared admin DataTable: sortable columns (sort by
 * stock, cost, price or stock value — the numbers a stock-take actually needs
 * ordered), client pagination and a stacked card view on phones/portrait
 * iPads. Search and filtering stay on the page's server-side filter form, so
 * there is deliberately no second search box here.
 */
export function ProductsTable({ rows, filtered }: { rows: ProductRow[]; filtered: boolean }) {
  const t = useStaffT();
  const locale = useStaffLocale();
  const columns: Column<ProductRow>[] = [
    {
      key: "name",
      header: t("Product"),
      primary: true,
      value: (p) => productName(p, locale),
      render: (p) => (
        <div className="flex flex-col">
          <Link href={`/admin/inventory/products/${p.id}`} className="font-medium text-[var(--color-ink)] hover:text-[var(--color-teal-ink)] hover:underline">
            {productName(p, locale)}
          </Link>
          <span className="text-xs text-[var(--color-ink)]/55">{[p.brandName, p.sku, p.category].filter(Boolean).join(" · ") || "—"}</span>
          {!p.isActive && (
            <span className="mt-1">
              <Badge>{t("Inactive")}</Badge>
            </span>
          )}
        </div>
      ),
    },
    {
      key: "kind",
      header: t("Type"),
      value: (p) => p.kind,
      render: (p) => <span className="text-xs">{locale === "ar" && KIND_LABELS[p.kind] ? t(KIND_LABELS[p.kind]) : p.kind.toLowerCase()}</span>,
    },
    {
      key: "stock",
      header: t("In stock"),
      numeric: true,
      value: (p) => p.stockQty,
      render: (p) => (
        <span className={isLow(p) ? "font-semibold text-red-700" : ""}>
          {qtyUnit(p.stockQty, p.unit, t)}
        </span>
      ),
    },
    { key: "reorder", header: t("Reorder at"), numeric: true, value: (p) => p.reorderLevel, render: (p) => (p.reorderLevel ? qtyUnit(p.reorderLevel, p.unit, t) : "—") },
    { key: "cost", header: t("Cost"), numeric: true, value: (p) => p.costMinor, render: (p) => formatSarMinor(p.costMinor) },
    { key: "price", header: t("Price excl. VAT"), numeric: true, value: (p) => p.priceMinor ?? -1, render: (p) => (p.priceMinor ? formatSarMinor(p.priceMinor) : "—") },
    { key: "value", header: t("Stock value"), numeric: true, value: (p) => Math.max(p.stockQty, 0) * p.costMinor, render: (p) => formatSarMinor(Math.max(p.stockQty, 0) * p.costMinor) },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(p) => p.id}
      cardsBelow="lg"
      empty={filtered ? t("No products match these filters.") : t("No products yet. Create your first product to start tracking stock.")}
      ariaLabel={t("Products")}
    />
  );
}
