import Link from "next/link";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listPurchaseOrders } from "@/modules/inventory/purchaseOrders";
import { formatSarMinor, PO_STATUSES } from "@/modules/inventory/money";
import { InventorySubnav, PoStatusBadge, ResponsiveTable, formatDate } from "../_components/ui";

interface Props {
  searchParams: Promise<{ status?: string }>;
}

export default async function PurchaseOrdersPage({ searchParams }: Props) {
  const user = await requireAdmin(PERMISSIONS.INVENTORY_MANAGE);
  const { status } = await searchParams;
  const statusFilter = status && (PO_STATUSES as readonly string[]).includes(status) ? status : undefined;
  const orders = await listPurchaseOrders({ status: statusFilter });

  return (
    <AdminShell
      user={user}
      title="Purchase orders"
      description="Order stock from suppliers, then receive it (in full or in part) to update stock, lots and cost."
      actions={
        <Link href="/admin/inventory/purchase-orders/new" className="lunia-btn lunia-btn-forest min-h-11">
          New purchase order
        </Link>
      }
    >
      <InventorySubnav active="/admin/inventory/purchase-orders" />

      <div className="mb-5 flex flex-wrap gap-2">
        {(["", ...PO_STATUSES] as const).map((s) => {
          const active = s === "" ? !statusFilter : statusFilter === s;
          return (
            <Link
              key={s || "all"}
              href={s ? `/admin/inventory/purchase-orders?status=${s}` : "/admin/inventory/purchase-orders"}
              className={`flex min-h-11 items-center rounded-full px-4 text-xs font-medium uppercase tracking-wide transition-colors ${
                active ? "bg-[var(--color-teal)] text-[var(--color-ink)]" : "border border-[var(--line-strong)] text-[var(--color-ink)]/70 hover:bg-[var(--surface-2)]"
              }`}
            >
              {s || "All"}
            </Link>
          );
        })}
      </div>

      <ResponsiveTable
        rows={orders}
        rowKey={(po) => po.id}
        empty="No purchase orders here yet."
        columns={[
          {
            key: "number",
            header: "PO",
            render: (po) => (
              <Link href={`/admin/inventory/purchase-orders/${po.id}`} className="font-mono font-medium hover:text-[var(--color-teal-ink)] hover:underline">
                {po.number}
              </Link>
            ),
          },
          {
            key: "supplier",
            header: "Supplier",
            render: (po) => (
              <Link href={`/admin/inventory/suppliers/${po.supplier.id}`} className="hover:underline">
                {po.supplier.name}
              </Link>
            ),
          },
          { key: "status", header: "Status", render: (po) => <PoStatusBadge status={po.status} /> },
          { key: "lines", header: "Lines", align: "right", render: (po) => po._count.lines },
          { key: "created", header: "Created", render: (po) => formatDate(po.createdAt) },
          { key: "ordered", header: "Ordered", render: (po) => formatDate(po.orderedAt) },
          { key: "total", header: "Total excl. VAT", align: "right", render: (po) => formatSarMinor(po.totalMinor) },
        ]}
      />
    </AdminShell>
  );
}
