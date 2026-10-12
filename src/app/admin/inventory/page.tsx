import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listProducts, listCategories } from "@/modules/inventory/products";
import { listSupplierOptions } from "@/modules/inventory/suppliers";
import { getInventoryDashboard } from "@/modules/inventory/dashboard";
import { formatSarMinor, PRODUCT_KINDS } from "@/modules/inventory/money";
import { ScanBox } from "./_components/ScanBox";
import { Badge, InventorySubnav, MovementBadge, ResponsiveTable, Section, StatCard, formatDate, formatDateTime, labelClass, labelText } from "./_components/ui";
import { ProductsTable, type ProductRow } from "./ProductsTable";

interface Props {
  searchParams: Promise<{ q?: string; kind?: string; category?: string; supplier?: string; low?: string; inactive?: string }>;
}

export default async function InventoryPage({ searchParams }: Props) {
  const user = await requireAdmin(PERMISSIONS.INVENTORY_MANAGE);
  const params = await searchParams;
  const filters = {
    q: params.q?.slice(0, 100),
    kind: params.kind,
    category: params.category,
    supplierId: params.supplier,
    lowStock: params.low === "1",
    includeInactive: params.inactive === "1",
  };
  const filtered = !!(filters.q || filters.kind || filters.category || filters.supplierId || filters.lowStock || filters.includeInactive);

  const [products, categories, suppliers, dash] = await Promise.all([
    listProducts(filters),
    listCategories(),
    listSupplierOptions(),
    getInventoryDashboard(),
  ]);
  const expiringCount = dash.expiring.length;

  // Slim, serializable rows for the client products table (sort + pagination).
  const productRows: ProductRow[] = products.map((p) => ({
    id: p.id,
    nameEn: p.nameEn,
    brandName: p.brandName,
    sku: p.sku,
    category: p.category,
    kind: p.kind,
    stockQty: p.stockQty,
    unit: p.unit,
    reorderLevel: p.reorderLevel,
    costMinor: p.costMinor,
    priceMinor: p.priceMinor,
    isActive: p.isActive,
  }));

  return (
    <AdminShell
      user={user}
      title="Products & stock"
      description="Retail products and treatment consumables: stock on hand, value, reorder alerts and expiry."
      actions={
        <Link href="/admin/inventory/products/new" className="lunia-btn lunia-btn-forest min-h-11">
          New product
        </Link>
      }
    >
      <InventorySubnav active="/admin/inventory" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Stock value at cost" value={formatSarMinor(dash.valueMinor)} hint="Active products, weighted average cost" />
        <StatCard label="Low stock" value={dash.lowStock} hint="At/below reorder level" href="/admin/inventory?low=1" tone={dash.lowStock ? "alert" : undefined} />
        <StatCard label="Expiring in 60 days" value={expiringCount} hint="Lots likely still on the shelf" href="#expiring" tone={expiringCount ? "alert" : undefined} />
        <StatCard label="Reorder" value="Suggest" hint="Draft a PO for low stock" href="/admin/inventory/purchase-orders/new?suggest=1" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_22rem]">
        <form method="get" className="lunia-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Filter products">
          <label className={`${labelClass} sm:col-span-2 lg:col-span-3`}>
            <span className={labelText}>Search</span>
            <input type="search" name="q" defaultValue={filters.q} placeholder="Name, brand, SKU or barcode" className="lunia-input min-h-11" />
          </label>
          <label className={labelClass}>
            <span className={labelText}>Type</span>
            <select name="kind" defaultValue={filters.kind ?? ""} className="lunia-input min-h-11">
              <option value="">All</option>
              {PRODUCT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.charAt(0) + k.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelText}>Category</span>
            <select name="category" defaultValue={filters.category ?? ""} className="lunia-input min-h-11">
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelText}>Supplier</span>
            <select name="supplier" defaultValue={filters.supplierId ?? ""} className="lunia-input min-h-11">
              <option value="">All</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:col-span-2 lg:col-span-3">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="low" value="1" defaultChecked={filters.lowStock} className="h-5 w-5 accent-[var(--color-teal-ink)]" />
              Low stock only
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="inactive" value="1" defaultChecked={filters.includeInactive} className="h-5 w-5 accent-[var(--color-teal-ink)]" />
              Include inactive
            </label>
            <div className="ms-auto flex gap-2">
              {filtered && (
                <Link href="/admin/inventory" className="lunia-btn lunia-btn-ghost min-h-11">
                  Clear
                </Link>
              )}
              <button type="submit" className="lunia-btn lunia-btn-forest-outline min-h-11">
                Apply
              </button>
            </div>
          </div>
        </form>
        <ScanBox />
      </div>

      <Section title={`Products (${products.length})`}>
        <ProductsTable rows={productRows} filtered={filtered} />
      </Section>

      <Section title="Expiring soon" id="expiring">
        <p className="mb-3 max-w-3xl text-sm text-[var(--color-ink)]/60">
          Lots expiring in the next 60 days (and already expired) that probably still have stock, assuming the oldest stock is used first. Write
          off expired units from the product page with a Waste adjustment and the lot number.
        </p>
        <ResponsiveTable
          rows={dash.expiring}
          rowKey={(l) => l.movementId}
          empty="Nothing expiring in the next 60 days."
          columns={[
            {
              key: "product",
              header: "Product",
              render: (l) => (
                <Link href={`/admin/inventory/products/${l.productId}`} className="font-medium hover:underline">
                  {l.productName}
                </Link>
              ),
            },
            { key: "lot", header: "Lot", render: (l) => l.lotNumber ?? "—" },
            { key: "expires", header: "Expires", render: (l) => (l.expired ? <Badge tone="red">Expired {formatDate(l.expiresAt)}</Badge> : formatDate(l.expiresAt)) },
            { key: "qty", header: "Likely on hand", align: "right", render: (l) => `${l.plausibleQty} ${l.unit}` },
            { key: "received", header: "Received", render: (l) => formatDate(l.receivedAt) },
          ]}
        />
      </Section>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Section title="Most used, last 30 days">
          <ResponsiveTable
            rows={dash.top}
            rowKey={(r) => r.productId}
            empty="No treatment consumption recorded in the last 30 days."
            columns={[
              {
                key: "product",
                header: "Product",
                render: (r) => (
                  <Link href={`/admin/inventory/products/${r.productId}`} className="font-medium hover:underline">
                    {r.nameEn}
                  </Link>
                ),
              },
              { key: "qty", header: "Used", align: "right", render: (r) => `${r.qty} ${r.unit}` },
              { key: "value", header: "At cost", align: "right", render: (r) => formatSarMinor(r.valueMinor) },
            ]}
          />
        </Section>
        <Section title="Recent movements">
          <ResponsiveTable
            rows={dash.recent}
            rowKey={(m) => m.id}
            empty="No stock movements yet."
            columns={[
              {
                key: "product",
                header: "Product",
                render: (m) => (
                  <Link href={`/admin/inventory/products/${m.product.id}`} className="font-medium hover:underline">
                    {m.product.nameEn}
                  </Link>
                ),
              },
              { key: "type", header: "Type", render: (m) => <MovementBadge type={m.type} /> },
              { key: "qty", header: "Qty", align: "right", render: (m) => `${m.qty > 0 ? "+" : ""}${m.qty} ${m.product.unit}` },
              { key: "when", header: "When", render: (m) => <span className="text-xs">{formatDateTime(m.createdAt)}</span> },
            ]}
          />
        </Section>
      </div>
    </AdminShell>
  );
}
