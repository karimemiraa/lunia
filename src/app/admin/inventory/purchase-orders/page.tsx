import Link from "next/link";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listPurchaseOrders } from "@/modules/inventory/purchaseOrders";
import { formatSarMinor, PO_STATUSES } from "@/modules/inventory/money";
import { getStaffLocale, getStaffT } from "../../_i18n/display";
import { EnumText } from "../_components/i18n";
import { InventorySubnav, PO_STATUS_LABELS, PoStatusBadge, ResponsiveTable, formatDate } from "../_components/ui";

interface Props {
  searchParams: Promise<{ status?: string }>;
}

export default async function PurchaseOrdersPage({ searchParams }: Props) {
  const user = await requireAdmin(PERMISSIONS.INVENTORY_MANAGE);
  const { status } = await searchParams;
  const statusFilter = status && (PO_STATUSES as readonly string[]).includes(status) ? status : undefined;
  const [orders, t, locale] = await Promise.all([listPurchaseOrders({ status: statusFilter }), getStaffT(), getStaffLocale()]);

  return (
    <AdminShell
      user={user}
      title="Purchase orders"
      description="Order stock from suppliers, then receive it (in full or in part) to update stock, lots and cost."
      actions={
        <Link href="/admin/inventory/purchase-orders/new" className="lunia-btn lunia-btn-forest min-h-11">
          {t("New purchase order")}
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
              {s ? <EnumText value={s} label={PO_STATUS_LABELS[s]} /> : t("All")}
            </Link>
          );
        })}
      </div>

      <ResponsiveTable
        rows={orders}
        rowKey={(po) => po.id}
        empty={t("No purchase orders here yet.")}
        columns={[
          {
            key: "number",
            header: t("PO"),
            render: (po) => (
              <Link href={`/admin/inventory/purchase-orders/${po.id}`} className="font-mono font-medium hover:text-[var(--color-teal-ink)] hover:underline">
                {po.number}
              </Link>
            ),
          },
          {
            key: "supplier",
            header: t("Supplier"),
            render: (po) => (
              <Link href={`/admin/inventory/suppliers/${po.supplier.id}`} className="hover:underline">
                {po.supplier.name}
              </Link>
            ),
          },
          { key: "status", header: t("Status"), render: (po) => <PoStatusBadge status={po.status} /> },
          { key: "lines", header: t("Lines"), align: "right", render: (po) => po._count.lines },
          { key: "created", header: t("Created"), render: (po) => formatDate(po.createdAt, locale) },
          { key: "ordered", header: t("Ordered"), render: (po) => formatDate(po.orderedAt, locale) },
          { key: "total", header: t("Total excl. VAT"), align: "right", render: (po) => formatSarMinor(po.totalMinor) },
        ]}
      />
    </AdminShell>
  );
}
