"use client";

import Link from "next/link";
import { DataTable, type Column } from "../_ui/DataTable";
import { formatSarMinor } from "@/modules/inventory/money";
import { Badge } from "./_components/ui";

export interface ProductRow {
  id: string;
  nameEn: string;
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
  const columns: Column<ProductRow>[] = [
    {
      key: "name",
      header: "Product",
      primary: true,
      value: (p) => p.nameEn,
      render: (p) => (
        <div className="flex flex-col">
          <Link href={`/admin/inventory/products/${p.id}`} className="font-medium text-[var(--color-ink)] hover:text-[var(--color-teal-ink)] hover:underline">
            {p.nameEn}
          </Link>
          <span className="text-xs text-[var(--color-ink)]/55">{[p.brandName, p.sku, p.category].filter(Boolean).join(" · ") || "—"}</span>
          {!p.isActive && (
            <span className="mt-1">
              <Badge>Inactive</Badge>
            </span>
          )}
        </div>
      ),
    },
    { key: "kind", header: "Type", value: (p) => p.kind, render: (p) => <span className="text-xs">{p.kind.toLowerCase()}</span> },
    {
      key: "stock",
      header: "In stock",
      numeric: true,
      value: (p) => p.stockQty,
      render: (p) => (
        <span className={isLow(p) ? "font-semibold text-red-700" : ""}>
          {p.stockQty} {p.unit}
        </span>
      ),
    },
    { key: "reorder", header: "Reorder at", numeric: true, value: (p) => p.reorderLevel, render: (p) => (p.reorderLevel ? `${p.reorderLevel} ${p.unit}` : "—") },
    { key: "cost", header: "Cost", numeric: true, value: (p) => p.costMinor, render: (p) => formatSarMinor(p.costMinor) },
    { key: "price", header: "Price excl. VAT", numeric: true, value: (p) => p.priceMinor ?? -1, render: (p) => (p.priceMinor ? formatSarMinor(p.priceMinor) : "—") },
    { key: "value", header: "Stock value", numeric: true, value: (p) => Math.max(p.stockQty, 0) * p.costMinor, render: (p) => formatSarMinor(Math.max(p.stockQty, 0) * p.costMinor) },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(p) => p.id}
      cardsBelow="lg"
      empty={filtered ? "No products match these filters." : "No products yet. Create your first product to start tracking stock."}
      ariaLabel="Products"
    />
  );
}
