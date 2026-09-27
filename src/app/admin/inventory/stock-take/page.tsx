import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listProducts } from "@/modules/inventory/products";
import { StockTakeSheet } from "../_components/StockTakeSheet";
import { InventorySubnav } from "../_components/ui";

export default async function StockTakePage() {
  const user = await requireAdmin(PERMISSIONS.INVENTORY_MANAGE);
  const products = await listProducts();

  return (
    <AdminShell
      user={user}
      title="Stock-take"
      description="Count what's on the shelves, review the differences, then post them all as adjustments in one go. Leave a product blank to skip it."
    >
      <InventorySubnav active="/admin/inventory/stock-take" />
      <StockTakeSheet
        products={products.map((p) => ({
          id: p.id,
          nameEn: p.nameEn,
          sku: p.sku,
          barcode: p.barcode,
          category: p.category,
          unit: p.unit,
          stockQty: p.stockQty,
        }))}
      />
    </AdminShell>
  );
}
