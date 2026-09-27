import Link from "next/link";
import { requireAdmin } from "../../../_components/requireAdmin";
import { AdminShell } from "../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listProductOptions } from "@/modules/inventory/products";
import { listSupplierOptions } from "@/modules/inventory/suppliers";
import { PoEditor } from "../../_components/PoEditor";
import { InventorySubnav } from "../../_components/ui";

interface Props {
  searchParams: Promise<{ supplier?: string; suggest?: string }>;
}

export default async function NewPurchaseOrderPage({ searchParams }: Props) {
  const user = await requireAdmin(PERMISSIONS.INVENTORY_MANAGE);
  const params = await searchParams;
  const [suppliers, products] = await Promise.all([listSupplierOptions(), listProductOptions()]);
  const supplierId = suppliers.some((s) => s.id === params.supplier) ? params.supplier! : "";

  return (
    <AdminShell user={user} title="New purchase order" description="Saved as a draft first. Mark it as ordered once it has been sent to the supplier.">
      <InventorySubnav active="/admin/inventory/purchase-orders" />
      {suppliers.length === 0 ? (
        <p className="lunia-card p-6 text-sm text-[var(--color-ink)]/70">
          Add a supplier first under{" "}
          <Link href="/admin/inventory/suppliers" className="font-medium text-[var(--color-teal-ink)] underline">
            Suppliers
          </Link>
          .
        </p>
      ) : (
        <PoEditor suppliers={suppliers} products={products} initial={{ supplierId, notes: "", lines: [] }} autoSuggest={params.suggest === "1"} />
      )}
    </AdminShell>
  );
}
