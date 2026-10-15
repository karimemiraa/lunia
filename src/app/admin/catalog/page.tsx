import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getStaffT } from "../_i18n/display";

const CATALOG_SECTIONS = [
  { href: "/admin/catalog/departments", label: "Departments", description: "Service departments shown on the public site." },
  { href: "/admin/catalog/services", label: "Services", description: "Individual services, grouped under a department." },
  { href: "/admin/catalog/brands", label: "Brands", description: "Partner and product brands featured on the site." },
  { href: "/admin/catalog/journal", label: "Blog", description: "Blog posts." },
];

export default async function CatalogHubPage() {
  const user = await requireAdmin(PERMISSIONS.CMS_MANAGE);
  const t = await getStaffT();

  return (
    <AdminShell user={user} title="Catalog" description="Manage departments, services, brands, and journal posts.">
      <ul className="flex flex-col gap-2">
        {CATALOG_SECTIONS.map((section) => (
          <li key={section.href}>
            <a
              href={section.href}
              className="flex flex-col gap-1 rounded border border-[var(--color-ink)]/10 px-4 py-3 hover:bg-[var(--color-cream)]/40"
            >
              <span className="text-sm font-medium text-[var(--color-ink)]">{t(section.label)}</span>
              <span className="text-xs text-[var(--color-ink)]/60">{t(section.description)}</span>
            </a>
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
