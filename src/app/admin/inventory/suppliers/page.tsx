import Link from "next/link";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listSuppliers } from "@/modules/inventory/suppliers";
import { SupplierForm, EMPTY_SUPPLIER } from "../_components/SupplierForm";
import { getStaffT } from "../../_i18n/display";
import { Badge, InventorySubnav, ResponsiveTable, Section } from "../_components/ui";

interface Props {
  searchParams: Promise<{ inactive?: string }>;
}

export default async function SuppliersPage({ searchParams }: Props) {
  const user = await requireAdmin(PERMISSIONS.INVENTORY_MANAGE);
  const { inactive } = await searchParams;
  const includeInactive = inactive === "1";
  const [suppliers, t] = await Promise.all([listSuppliers({ includeInactive }), getStaffT()]);

  return (
    <AdminShell user={user} title="Suppliers" description="Who you buy from: contacts, VAT numbers, the products they supply and purchase history.">
      <InventorySubnav active="/admin/inventory/suppliers" />

      <div className="mb-3 flex justify-end">
        <Link href={includeInactive ? "/admin/inventory/suppliers" : "/admin/inventory/suppliers?inactive=1"} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
          {includeInactive ? t("Hide inactive") : t("Show inactive")}
        </Link>
      </div>
      <ResponsiveTable
        rows={suppliers}
        rowKey={(s) => s.id}
        empty={t("No suppliers yet. Add one below.")}
        columns={[
          {
            key: "name",
            header: t("Supplier"),
            render: (s) => (
              <span className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/inventory/suppliers/${s.id}`} className="font-medium hover:text-[var(--color-teal-ink)] hover:underline">
                  {s.name}
                </Link>
                {!s.isActive && <Badge>{t("Inactive")}</Badge>}
              </span>
            ),
          },
          { key: "contact", header: t("Contact"), render: (s) => s.contactName ?? "—" },
          {
            key: "phone",
            header: t("Phone / email"),
            render: (s) => (
              <span className="flex flex-col text-xs">
                {s.phone && <a href={`tel:${s.phone}`} dir="ltr" className="hover:underline">{s.phone}</a>}
                {s.email && <a href={`mailto:${s.email}`} dir="ltr" className="hover:underline">{s.email}</a>}
                {!s.phone && !s.email && "—"}
              </span>
            ),
          },
          { key: "vat", header: t("VAT no."), render: (s) => <span className="font-mono text-xs">{s.vatNumber ?? "—"}</span> },
          { key: "products", header: t("Products"), align: "right", render: (s) => s._count.products },
          { key: "pos", header: t("Orders"), align: "right", render: (s) => s._count.purchaseOrders },
        ]}
      />

      <Section title={t("New supplier")}>
        <div className="max-w-3xl">
          <SupplierForm initial={EMPTY_SUPPLIER} />
        </div>
      </Section>
    </AdminShell>
  );
}
