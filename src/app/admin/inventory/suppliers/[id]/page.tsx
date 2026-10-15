import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../../_components/requireAdmin";
import { AdminShell } from "../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getSupplierDetail } from "@/modules/inventory/suppliers";
import { formatSarMinor } from "@/modules/inventory/money";
import { SupplierForm } from "../../_components/SupplierForm";
import { getStaffLocale, getStaffT } from "../../../_i18n/display";
import { arabicProductNames } from "../../_components/arabicNames";
import { Badge, InventorySubnav, PoStatusBadge, ResponsiveTable, Section, StatCard, formatDate, qtyUnit } from "../../_components/ui";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SupplierPage({ params }: Props) {
  const user = await requireAdmin(PERMISSIONS.INVENTORY_MANAGE);
  const { id } = await params;
  const supplier = await getSupplierDetail(id);
  if (!supplier) notFound();

  const [t, locale] = await Promise.all([getStaffT(), getStaffLocale()]);
  const arNames = await arabicProductNames(locale, supplier.products.map((p) => p.id));
  const openOrders = supplier.purchaseOrders.filter((po) => ["DRAFT", "ORDERED", "PARTIAL"].includes(po.status)).length;

  return (
    <AdminShell
      user={user}
      title={supplier.name}
      description={supplier.vatNumber ? t("VAT {number}", { number: supplier.vatNumber }) : undefined}
      actions={
        <Link href={`/admin/inventory/purchase-orders/new?supplier=${supplier.id}`} className="lunia-btn lunia-btn-forest min-h-11">
          {t("New purchase order")}
        </Link>
      }
    >
      <InventorySubnav active="/admin/inventory/suppliers" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label={t("Products")} value={supplier.products.length} />
        <StatCard label={t("Open orders")} value={openOrders} />
        <StatCard label={t("Received to date")} value={formatSarMinor(supplier.receivedSpendMinor)} hint={t("At purchase cost, excl. VAT")} />
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

      <Section title={t("Products supplied")}>
        <ResponsiveTable
          rows={supplier.products}
          rowKey={(p) => p.id}
          empty={t("No products are linked to this supplier. Set the supplier on a product's page.")}
          columns={[
            {
              key: "name",
              header: t("Product"),
              render: (p) => (
                <span className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/inventory/products/${p.id}`} className="font-medium hover:underline">
                    {arNames.get(p.id) ?? p.nameEn}
                  </Link>
                  {!p.isActive && <Badge>{t("Inactive")}</Badge>}
                </span>
              ),
            },
            { key: "sku", header: t("SKU"), render: (p) => <span className="font-mono text-xs" dir="ltr">{p.sku ?? "—"}</span> },
            { key: "stock", header: t("In stock"), align: "right", render: (p) => qtyUnit(p.stockQty, p.unit, t) },
            { key: "cost", header: t("Cost"), align: "right", render: (p) => formatSarMinor(p.costMinor) },
          ]}
        />
      </Section>

      <Section title={t("Purchase history")}>
        <ResponsiveTable
          rows={supplier.purchaseOrders}
          rowKey={(po) => po.id}
          empty={t("No purchase orders yet.")}
          columns={[
            {
              key: "number",
              header: t("PO"),
              render: (po) => (
                <Link href={`/admin/inventory/purchase-orders/${po.id}`} className="font-mono font-medium hover:underline">
                  {po.number}
                </Link>
              ),
            },
            { key: "status", header: t("Status"), render: (po) => <PoStatusBadge status={po.status} /> },
            { key: "created", header: t("Created"), render: (po) => formatDate(po.createdAt, locale) },
            { key: "received", header: t("Received"), render: (po) => formatDate(po.receivedAt, locale) },
            { key: "total", header: t("Total"), align: "right", render: (po) => formatSarMinor(po.totalMinor) },
          ]}
        />
      </Section>
    </AdminShell>
  );
}
