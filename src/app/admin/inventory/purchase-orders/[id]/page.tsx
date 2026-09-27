import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../../_components/requireAdmin";
import { AdminShell } from "../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getPurchaseOrder, getReceiptsForPo } from "@/modules/inventory/purchaseOrders";
import { listProductOptions } from "@/modules/inventory/products";
import { listSupplierOptions } from "@/modules/inventory/suppliers";
import { formatSarMinor } from "@/modules/inventory/money";
import { PoEditor } from "../../_components/PoEditor";
import { PoReceiveForm, PoStatusActions } from "../../_components/PoReceive";
import { InventorySubnav, PoStatusBadge, ResponsiveTable, Section, formatDate, formatDateTime } from "../../_components/ui";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PurchaseOrderPage({ params }: Props) {
  const user = await requireAdmin(PERMISSIONS.INVENTORY_MANAGE);
  const { id } = await params;
  const po = await getPurchaseOrder(id);
  if (!po) notFound();

  const isDraft = po.status === "DRAFT";
  const canReceive = po.status === "ORDERED" || po.status === "PARTIAL";
  const [receipts, suppliers, products] = await Promise.all([
    getReceiptsForPo(id),
    isDraft ? listSupplierOptions() : Promise.resolve([]),
    isDraft ? listProductOptions() : Promise.resolve([]),
  ]);
  const supplierOptions = suppliers.some((s) => s.id === po.supplierId) ? suppliers : [...suppliers, { id: po.supplier.id, name: po.supplier.name }];

  return (
    <AdminShell
      user={user}
      title={po.number}
      description={`${po.supplier.name} · created ${formatDate(po.createdAt)}${po.orderedAt ? ` · ordered ${formatDate(po.orderedAt)}` : ""}${po.receivedAt ? ` · received ${formatDate(po.receivedAt)}` : ""}`}
      actions={
        <Link href={`/admin/inventory/purchase-orders/${po.id}/print`} target="_blank" className="lunia-btn lunia-btn-ghost min-h-11">
          Print / PDF
        </Link>
      }
    >
      <InventorySubnav active="/admin/inventory/purchase-orders" />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <PoStatusBadge status={po.status} />
        <PoStatusActions poId={po.id} status={po.status} />
      </div>

      {isDraft ? (
        <PoEditor
          poId={po.id}
          suppliers={supplierOptions}
          products={products}
          initial={{
            supplierId: po.supplierId,
            notes: po.notes ?? "",
            lines: po.lines.map((l) => ({ productId: l.productId, qty: l.qty, unitCostMinor: l.unitCostMinor })),
          }}
        />
      ) : (
        <>
          {po.notes && <p className="mb-4 text-sm text-[var(--color-ink)]/70">Notes: {po.notes}</p>}
          <ResponsiveTable
            rows={po.lines}
            rowKey={(l) => l.id}
            columns={[
              {
                key: "product",
                header: "Product",
                render: (l) => (
                  <Link href={`/admin/inventory/products/${l.product.id}`} className="font-medium hover:underline">
                    {l.product.nameEn}
                  </Link>
                ),
              },
              { key: "ordered", header: "Ordered", align: "right", render: (l) => `${l.qty} ${l.product.unit}` },
              {
                key: "received",
                header: "Received",
                align: "right",
                render: (l) => <span className={l.receivedQty < l.qty ? "text-[var(--color-ink)]/70" : "font-medium text-[var(--color-teal-ink)]"}>{l.receivedQty}</span>,
              },
              { key: "cost", header: "Unit cost", align: "right", render: (l) => formatSarMinor(l.unitCostMinor) },
              { key: "total", header: "Line total", align: "right", render: (l) => formatSarMinor(l.qty * l.unitCostMinor) },
            ]}
          />
          <div className="mt-3 flex justify-end gap-6 text-sm">
            <span className="text-[var(--color-ink)]/60">Total excl. VAT</span>
            <span className="font-semibold tabular-nums">{formatSarMinor(po.totalMinor)}</span>
          </div>
        </>
      )}

      {canReceive && (
        <div className="mt-8">
          <PoReceiveForm
            poId={po.id}
            lines={po.lines.map((l) => ({ id: l.id, productName: l.product.nameEn, unit: l.product.unit, qty: l.qty, receivedQty: l.receivedQty }))}
          />
        </div>
      )}

      {receipts.length > 0 && (
        <Section title="Receipts">
          <ResponsiveTable
            rows={receipts}
            rowKey={(m) => m.id}
            columns={[
              { key: "product", header: "Product", render: (m) => m.product.nameEn },
              { key: "when", header: "Received", render: (m) => formatDateTime(m.createdAt) },
              { key: "qty", header: "Qty", align: "right", render: (m) => `${m.qty} ${m.product.unit}` },
              { key: "lot", header: "Lot", render: (m) => <span className="font-mono text-xs">{m.lotNumber ?? "—"}</span> },
              { key: "expires", header: "Expires", render: (m) => formatDate(m.expiresAt) },
            ]}
          />
        </Section>
      )}
    </AdminShell>
  );
}
