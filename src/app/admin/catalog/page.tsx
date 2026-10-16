import { redirect } from "next/navigation";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getStaffT } from "../_i18n/display";

// Services and departments (prices, durations) belong to the catalog
// permission; brands and the blog are website content.
const CATALOG_SECTIONS = [
  { href: "/admin/catalog/departments", label: "Departments", description: "Service departments shown on the public site.", perm: PERMISSIONS.CATALOG_MANAGE },
  { href: "/admin/catalog/services", label: "Services", description: "Individual services, grouped under a department.", perm: PERMISSIONS.CATALOG_MANAGE },
  { href: "/admin/catalog/brands", label: "Brands", description: "Partner and product brands featured on the site.", perm: PERMISSIONS.CMS_MANAGE },
  { href: "/admin/catalog/journal", label: "Blog", description: "Blog posts.", perm: PERMISSIONS.CMS_MANAGE },
];

export default async function CatalogHubPage() {
  const user = await requireAdmin();
  const sections = CATALOG_SECTIONS.filter((s) => user.permissions.has(s.perm));
  if (sections.length === 0) redirect("/admin");
  const t = await getStaffT();

  return (
    <AdminShell user={user} title="Catalog" description="Manage departments, services, brands, and journal posts.">
      <ul className="flex flex-col gap-2">
        {sections.map((section) => (
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
