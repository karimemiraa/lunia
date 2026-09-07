import { requireAdmin } from "./_components/requireAdmin";
import { AdminShell } from "./_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";

const QUICK_LINKS = [
  { href: "/admin/media", label: "Media library", permission: PERMISSIONS.CMS_MANAGE },
  { href: "/admin/content", label: "Page content", permission: PERMISSIONS.CMS_MANAGE },
  { href: "/admin/settings", label: "Site settings", permission: PERMISSIONS.SETTINGS_MANAGE },
  { href: "/admin/tiers", label: "Membership tiers", permission: PERMISSIONS.SETTINGS_MANAGE },
  { href: "/admin/roles", label: "Roles & staff", permission: PERMISSIONS.STAFF_MANAGE },
] as const;

export default async function AdminHome() {
  const user = await requireAdmin();
  const links = QUICK_LINKS.filter((link) => user.permissions.has(link.permission));

  return (
    <AdminShell user={user} title="Dashboard" description="Welcome back.">
      <p className="text-[var(--color-ink)]">Signed in. Permissions: {user.permissions.size}</p>

      {links.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-3">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded border border-[var(--color-ink)]/15 px-4 py-3 text-sm text-[var(--color-ink)] hover:border-[var(--color-teal)] hover:bg-[var(--color-cream)]/40"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
