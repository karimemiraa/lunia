import { requireAdmin } from "../../../_components/requireAdmin";
import { AdminShell } from "../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listCategories } from "@/modules/inventory/products";
import { listSupplierOptions } from "@/modules/inventory/suppliers";
import { ProductForm } from "../../_components/ProductForm";
import { InventorySubnav } from "../../_components/ui";

interface Props {
  searchParams: Promise<{ barcode?: string }>;
}

export default async function NewProductPage({ searchParams }: Props) {
  const user = await requireAdmin(PERMISSIONS.INVENTORY_MANAGE);
  const { barcode } = await searchParams;
  const [suppliers, categories] = await Promise.all([listSupplierOptions(), listCategories()]);

  return (
    <AdminShell user={user} title="New product" description="Add a retail product or a treatment consumable. Scan its barcode into the Barcode field.">
      <InventorySubnav active="/admin/inventory" />
      <ProductForm
        suppliers={suppliers}
        categories={categories}
        initial={{
          sku: "",
          barcode: barcode?.slice(0, 64) ?? "",
          nameEn: "",
          nameAr: "",
          brandName: "",
          supplierId: "",
          category: "",
          unit: "pcs",
          kind: "RETAIL",
          costMinor: 0,
          priceMinor: 0,
          vatRateBp: 1500,
          reorderLevel: 0,
          isActive: true,
        }}
      />
    </AdminShell>
  );
}
