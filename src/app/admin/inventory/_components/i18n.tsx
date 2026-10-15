"use client";

import Link from "next/link";
import { useStaffLocale, useStaffT } from "../../_i18n/StaffI18n";

// Locale-aware bits for the inventory admin that render from both server and
// client components (ui.tsx stays hook-free, so the hooks live here).

/**
 * An enum value: English keeps showing the raw value exactly as before;
 * Arabic shows the translated English label.
 */
export function EnumText({ value, label }: { value: string; label?: string }) {
  const locale = useStaffLocale();
  const t = useStaffT();
  return <>{locale === "ar" && label ? t(label) : value}</>;
}

const SUBNAV = [
  { href: "/admin/inventory", label: "Products & stock" },
  { href: "/admin/inventory/stock-take", label: "Stock-take" },
  { href: "/admin/inventory/purchase-orders", label: "Purchase orders" },
  { href: "/admin/inventory/suppliers", label: "Suppliers" },
];

export function InventorySubnav({ active }: { active: string }) {
  const t = useStaffT();
  return (
    <nav aria-label={t("Inventory")} className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--line)]">
      {SUBNAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.href === active ? "page" : undefined}
          className={`-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 px-4 text-sm transition-colors ${
            item.href === active
              ? "border-[var(--color-teal-ink)] font-medium text-[var(--color-ink)]"
              : "border-transparent text-[var(--color-ink)]/60 hover:text-[var(--color-ink)]"
          }`}
        >
          {t(item.label)}
        </Link>
      ))}
    </nav>
  );
}
