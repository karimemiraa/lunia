import Link from "next/link";
import { listServiceConsumables } from "@/modules/inventory/consumables";
import { listProductOptions } from "@/modules/inventory/products";
import { ServiceConsumablesEditor } from "./ServiceConsumablesEditor";

// "Consumables used per session" for the catalog service editor. Rendered
// only for staff with inventory:manage (the caller checks); the save action
// re-checks the permission itself.
export async function ServiceConsumablesSection({ serviceId }: { serviceId: string }) {
  const [items, products] = await Promise.all([listServiceConsumables(serviceId), listProductOptions({ consumablesOnly: true })]);
  // Keep already-linked products selectable even if since marked retail-only/inactive.
  const options = [
    ...products.map((p) => ({ id: p.id, nameEn: p.nameEn, unit: p.unit })),
    ...items.filter((i) => !products.some((p) => p.id === i.productId)).map((i) => ({ id: i.product.id, nameEn: i.product.nameEn, unit: i.product.unit })),
  ];
  return (
    <section className="lunia-card mt-8 flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-base font-semibold">Consumables used per session</h2>
        <p className="text-sm text-[var(--color-ink)]/60">
          Deducted from stock automatically each time a booking with this service is completed. Manage products in{" "}
          <Link href="/admin/inventory" className="font-medium text-[var(--color-teal-ink)] underline">
            Inventory
          </Link>
          .
        </p>
      </div>
      <ServiceConsumablesEditor serviceId={serviceId} products={options} initial={items.map((i) => ({ productId: i.productId, qty: i.qty }))} />
    </section>
  );
}
