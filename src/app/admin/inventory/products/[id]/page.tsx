import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../../_components/requireAdmin";
import { AdminShell } from "../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { prisma } from "@/lib/db";
import { getProduct, listCategories } from "@/modules/inventory/products";
import { listSupplierOptions } from "@/modules/inventory/suppliers";
import { getProductLedger } from "@/modules/inventory/ledger";
import { listServicesUsingProduct } from "@/modules/inventory/consumables";
import { formatSarMinor } from "@/modules/inventory/money";
import { ProductForm } from "../../_components/ProductForm";
import { AdjustmentForm } from "../../_components/AdjustmentForm";
import { Badge, InventorySubnav, MovementBadge, ResponsiveTable, Section, StatCard, formatDate, formatDateTime } from "../../_components/ui";

interface Props {
  params: Promise<{ id: string }>;
}

const REF_LABELS: Record<string, string> = { INVOICE: "Invoice", APPOINTMENT: "Treatment", PURCHASE_ORDER: "Purchase order", MANUAL: "Manual" };

export default async function ProductPage({ params }: Props) {
  const user = await requireAdmin(PERMISSIONS.INVENTORY_MANAGE);
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const [suppliers, categories, ledger, usedBy, openLines] = await Promise.all([
    listSupplierOptions(),
    listCategories(),
    getProductLedger(id, 300),
    listServicesUsingProduct(id),
    prisma.purchaseOrderLine.findMany({
      where: { productId: id, purchaseOrder: { status: { in: ["DRAFT", "ORDERED", "PARTIAL"] } } },
      include: { purchaseOrder: { select: { id: true, number: true, status: true } } },
    }),
  ]);

  // Resolve who made each movement and PO numbers for PO references.
  const actorIds = [...new Set(ledger.map((m) => m.createdById).filter((x): x is string => !!x))];
  const poIds = [...new Set(ledger.filter((m) => m.refType === "PURCHASE_ORDER" && m.refId).map((m) => m.refId!))];
  const [actors, pos] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true, staffProfile: { select: { fullName: true } } } }),
    prisma.purchaseOrder.findMany({ where: { id: { in: poIds } }, select: { id: true, number: true } }),
  ]);
  const actorName = new Map(actors.map((a) => [a.id, a.staffProfile?.fullName || a.email || "Staff"]));
  const poNumber = new Map(pos.map((p) => [p.id, p.number]));
  const onOrder = openLines.reduce((sum, l) => sum + (l.qty - l.receivedQty), 0);
  const low = product.stockQty < 0 || (product.reorderLevel > 0 && product.stockQty <= product.reorderLevel);
  // Suppliers list only holds active ones; keep an inactive current supplier selectable.
  const supplierOptions =
    product.supplier && !suppliers.some((s) => s.id === product.supplier!.id) ? [...suppliers, product.supplier] : suppliers;

  return (
    <AdminShell
      user={user}
      title={product.nameEn}
      description={[product.brandName, product.sku && `SKU ${product.sku}`, product.barcode && `Barcode ${product.barcode}`].filter(Boolean).join(" · ") || undefined}
      actions={
        <Link href="/admin/inventory" className="lunia-btn lunia-btn-ghost min-h-11">
          All products
        </Link>
      }
    >
      <InventorySubnav active="/admin/inventory" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="On hand" value={`${product.stockQty} ${product.unit}`} hint={product.reorderLevel ? `Reorder at ${product.reorderLevel}` : "No reorder level set"} tone={low ? "alert" : undefined} />
        <StatCard label="On order" value={`${onOrder} ${product.unit}`} hint={`${openLines.length} open purchase order(s)`} />
        <StatCard label="Cost per unit" value={formatSarMinor(product.costMinor)} hint="Weighted average" />
        <StatCard label="Stock value" value={formatSarMinor(Math.max(product.stockQty, 0) * product.costMinor)} />
      </div>

      {(openLines.length > 0 || usedBy.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm text-[var(--color-ink)]/70">
          {openLines.length > 0 && (
            <p>
              On order:{" "}
              {openLines.map((l, i) => (
                <span key={l.id}>
                  {i > 0 && ", "}
                  <Link href={`/admin/inventory/purchase-orders/${l.purchaseOrder.id}`} className="font-medium text-[var(--color-teal-ink)] hover:underline">
                    {l.purchaseOrder.number}
                  </Link>{" "}
                  ({l.qty - l.receivedQty})
                </span>
              ))}
            </p>
          )}
          {usedBy.length > 0 && (
            <p>
              Used per session in:{" "}
              {usedBy.map((u, i) => (
                <span key={u.id}>
                  {i > 0 && ", "}
                  <Link href={`/admin/catalog/services/${u.service.id}`} className="font-medium text-[var(--color-teal-ink)] hover:underline">
                    {u.service.nameEn}
                  </Link>{" "}
                  ({u.qty} {product.unit})
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_24rem]">
        <ProductForm
          suppliers={supplierOptions}
          categories={categories}
          initial={{
            id: product.id,
            sku: product.sku ?? "",
            barcode: product.barcode ?? "",
            nameEn: product.nameEn,
            nameAr: product.nameAr ?? "",
            brandName: product.brandName ?? "",
            supplierId: product.supplierId ?? "",
            category: product.category ?? "",
            unit: product.unit,
            kind: product.kind,
            costMinor: product.costMinor,
            priceMinor: product.priceMinor,
            vatRateBp: product.vatRateBp,
            reorderLevel: product.reorderLevel,
            isActive: product.isActive,
          }}
        />
        <div>
          <AdjustmentForm productId={product.id} unit={product.unit} stockQty={product.stockQty} />
        </div>
      </div>

      <Section title="Stock ledger">
        <ResponsiveTable
          rows={ledger}
          rowKey={(m) => m.id}
          empty="No movements yet."
          columns={[
            { key: "when", header: "When", render: (m) => formatDateTime(m.createdAt) },
            { key: "type", header: "Type", render: (m) => <MovementBadge type={m.type} /> },
            {
              key: "qty",
              header: "Change",
              align: "right",
              render: (m) => (
                <span className={m.qty < 0 ? "text-red-700" : "text-[var(--color-teal-ink)]"}>
                  {m.qty > 0 ? "+" : ""}
                  {m.qty}
                </span>
              ),
            },
            { key: "balance", header: "Balance", align: "right", render: (m) => <span className={m.balance < 0 ? "font-semibold text-red-700" : "font-medium"}>{m.balance}</span> },
            {
              key: "ref",
              header: "Reference",
              render: (m) =>
                m.refType === "PURCHASE_ORDER" && m.refId ? (
                  <Link href={`/admin/inventory/purchase-orders/${m.refId}`} className="text-[var(--color-teal-ink)] hover:underline">
                    {poNumber.get(m.refId) ?? "Purchase order"}
                  </Link>
                ) : (
                  <span>{m.refType ? REF_LABELS[m.refType] ?? m.refType : "—"}</span>
                ),
            },
            {
              key: "lot",
              header: "Lot / expiry",
              render: (m) =>
                m.lotNumber || m.expiresAt ? (
                  <span className="text-xs">
                    {m.lotNumber ?? "—"}
                    {m.expiresAt && (
                      <>
                        {" · "}
                        {m.expiresAt <= new Date() ? <Badge tone="red">exp {formatDate(m.expiresAt)}</Badge> : `exp ${formatDate(m.expiresAt)}`}
                      </>
                    )}
                  </span>
                ) : (
                  "—"
                ),
            },
            { key: "cost", header: "Unit cost", align: "right", render: (m) => (m.unitCostMinor !== null ? formatSarMinor(m.unitCostMinor) : "—") },
            {
              key: "note",
              header: "Note",
              render: (m) => (
                <span className="text-xs text-[var(--color-ink)]/70">
                  {m.note ?? ""}
                  {m.createdById && <span className="block text-[var(--color-ink)]/50">{actorName.get(m.createdById) ?? "Staff"}</span>}
                </span>
              ),
            },
          ]}
        />
      </Section>
    </AdminShell>
  );
}
