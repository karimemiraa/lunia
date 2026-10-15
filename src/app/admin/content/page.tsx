import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getStaffT } from "../_i18n/display";

// Pages editable through this admin section. About/Services are added in the
// public-site stage; for now only the home page has a content editor.
const EDITABLE_PAGES = [{ key: "home", label: "Home" }];

export default async function ContentListPage() {
  const user = await requireAdmin(PERMISSIONS.CMS_MANAGE);
  const t = await getStaffT();

  return (
    <AdminShell user={user} title="Content" description="Edit copy and hero media for site pages.">
      <ul className="flex flex-col gap-2">
        {EDITABLE_PAGES.map((page) => (
          <li key={page.key}>
            <a
              href={`/admin/content/${page.key}`}
              className="block rounded border border-[var(--color-ink)]/10 px-4 py-3 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-cream)]/40"
            >
              {t(page.label)}
            </a>
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
