import Link from "next/link";
import { listServiceConsumables } from "@/modules/inventory/consumables";
import { listProductOptions } from "@/modules/inventory/products";
import { getStaffLocale, getStaffT } from "../../_i18n/display";
import { ServiceConsumablesEditor } from "./ServiceConsumablesEditor";
import { arabicProductNames } from "./arabicNames";
import { withSlot } from "./ui";

// "Consumables used per session" for the catalog service editor. Rendered
// only for staff with inventory:manage (the caller checks); the save action
// re-checks the permission itself.
export async function ServiceConsumablesSection({ serviceId }: { serviceId: string }) {
  const [items, products, t, locale] = await Promise.all([
    listServiceConsumables(serviceId),
    listProductOptions({ consumablesOnly: true }),
    getStaffT(),
    getStaffLocale(),
  ]);
  // Keep already-linked products selectable even if since marked retail-only/inactive.
  const options = [
    ...products.map((p) => ({ id: p.id, nameEn: p.nameEn, unit: p.unit })),
    ...items.filter((i) => !products.some((p) => p.id === i.productId)).map((i) => ({ id: i.product.id, nameEn: i.product.nameEn, unit: i.product.unit })),
  ];
  const arNames = await arabicProductNames(locale, options.map((o) => o.id));
  const localized = options.map((o) => ({ ...o, nameAr: arNames.get(o.id) ?? null }));
  return (
    <section className="lunia-card mt-8 flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-base font-semibold">{t("Consumables used per session")}</h2>
        <p className="text-sm text-[var(--color-ink)]/60">
          {withSlot(
            t,
            "Deducted from stock automatically each time a booking with this service is completed. Manage products in {link}.",
            "link",
            <Link href="/admin/inventory" className="font-medium text-[var(--color-teal-ink)] underline">
              {t("Inventory")}
            </Link>,
          )}
        </p>
      </div>
      <ServiceConsumablesEditor serviceId={serviceId} products={localized} initial={items.map((i) => ({ productId: i.productId, qty: i.qty }))} />
    </section>
  );
}
