import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../../_components/requireAdmin";
import { AdminShell } from "../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getSupplierDetail } from "@/modules/inventory/suppliers";
import { formatSarMinor } from "@/modules/inventory/money";
import { SupplierForm } from "../../_components/SupplierForm";
import { Badge, InventorySubnav, PoStatusBadge, ResponsiveTable, Section, StatCard, formatDate } from "../../_components/ui";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SupplierPage({ params }: Props) {
  const user = await requireAdmin(PERMISSIONS.INVENTORY_MANAGE);
  const { id } = await params;
  const supplier = await getSupplierDetail(id);
  if (!supplier) notFound();

  const openOrders = supplier.purchaseOrders.filter((po) => ["DRAFT", "ORDERED", "PARTIAL"].includes(po.status)).length;

  return (
    <AdminShell
      user={user}
      title={supplier.name}
      description={supplier.vatNumber ? `VAT ${supplier.vatNumber}` : undefined}
      actions={
        <Link href={`/admin/inventory/purchase-orders/new?supplier=${supplier.id}`} className="lunia-btn lunia-btn-forest min-h-11">
          New purchase order
        </Link>
      }
    >
      <InventorySubnav active="/admin/inventory/suppliers" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Products" value={supplier.products.length} />
        <StatCard label="Open orders" value={openOrders} />
        <StatCard label="Received to date" value={formatSarMinor(supplier.receivedSpendMinor)} hint="At purchase cost, excl. VAT" />
      </div>

      <div className="mt-8 max-w-3xl">
        <SupplierForm
          canDelete={supplier.purchaseOrders.length === 0}
          initial={{
            id: supplier.id,
            name: supplier.name,
            contactName: supplier.contactName ?? "",
            phone: supplier.phone ?? "",
            email: supplier.email ?? "",
            vatNumber: supplier.vatNumber ?? "",
            notes: supplier.notes ?? "",
            isActive: supplier.isActive,
          }}
        />
      </div>

      <Section title="Products supplied">
        <ResponsiveTable
          rows={supplier.products}
          rowKey={(p) => p.id}
          empty="No products are linked to this supplier. Set the supplier on a product's page."
          columns={[
            {
              key: "name",
              header: "Product",
              render: (p) => (
                <span className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/inventory/products/${p.id}`} className="font-medium hover:underline">
                    {p.nameEn}
                  </Link>
                  {!p.isActive && <Badge>Inactive</Badge>}
                </span>
              ),
            },
            { key: "sku", header: "SKU", render: (p) => <span className="font-mono text-xs">{p.sku ?? "—"}</span> },
            { key: "stock", header: "In stock", align: "right", render: (p) => `${p.stockQty} ${p.unit}` },
            { key: "cost", header: "Cost", align: "right", render: (p) => formatSarMinor(p.costMinor) },
          ]}
        />
      </Section>

      <Section title="Purchase history">
        <ResponsiveTable
          rows={supplier.purchaseOrders}
          rowKey={(po) => po.id}
          empty="No purchase orders yet."
          columns={[
            {
              key: "number",
              header: "PO",
              render: (po) => (
                <Link href={`/admin/inventory/purchase-orders/${po.id}`} className="font-mono font-medium hover:underline">
                  {po.number}
                </Link>
              ),
            },
            { key: "status", header: "Status", render: (po) => <PoStatusBadge status={po.status} /> },
            { key: "created", header: "Created", render: (po) => formatDate(po.createdAt) },
            { key: "received", header: "Received", render: (po) => formatDate(po.receivedAt) },
            { key: "total", header: "Total", align: "right", render: (po) => formatSarMinor(po.totalMinor) },
          ]}
        />
      </Section>
    </AdminShell>
  );
}
