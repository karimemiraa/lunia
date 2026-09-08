import { PERMISSIONS, type PermissionKey } from "@/modules/iam/permissions";

interface AdminNavProps {
  permissions: Set<PermissionKey>;
}

interface NavLink {
  href: string;
  label: string;
}

const linkClass =
  "px-3 py-2 rounded text-sm text-[var(--color-ink)] hover:bg-[var(--color-cream)] transition-colors";

export function AdminNav({ permissions }: AdminNavProps) {
  const links: NavLink[] = [{ href: "/admin", label: "Dashboard" }];

  if (permissions.has(PERMISSIONS.BOOKING_VIEW)) {
    links.push({ href: "/admin/calendar", label: "Calendar" });
  }
  if (permissions.has(PERMISSIONS.CLIENT_VIEW)) {
    links.push({ href: "/admin/clients", label: "Clients" });
  }
  if (permissions.has(PERMISSIONS.ANALYTICS_VIEW)) {
    links.push({ href: "/admin/dashboard", label: "Business" }, { href: "/admin/marketing", label: "Marketing" });
  }
  if (permissions.has(PERMISSIONS.CMS_MANAGE)) {
    links.push(
      { href: "/admin/media", label: "Media" },
      { href: "/admin/content", label: "Content" },
      { href: "/admin/catalog", label: "Catalog" },
      { href: "/admin/inquiries", label: "Inquiries" },
    );
  }
  if (permissions.has(PERMISSIONS.SETTINGS_MANAGE)) {
    links.push({ href: "/admin/settings", label: "Settings" }, { href: "/admin/tiers", label: "Tiers" });
  }
  if (permissions.has(PERMISSIONS.STAFF_MANAGE)) {
    links.push(
      { href: "/admin/roles", label: "Roles" },
      { href: "/admin/booking/rooms", label: "Rooms" },
      { href: "/admin/booking/schedules", label: "Schedules" },
    );
  }

  return (
    <nav
      aria-label="Admin navigation"
      className="flex h-full w-56 shrink-0 flex-col gap-1 border-r border-[var(--color-ink)]/10 bg-[var(--color-cream)]/40 p-4"
    >
      <span className="mb-4 text-lg font-semibold text-[var(--color-ink)]">Lunia Admin</span>
      {links.map((link) => (
        <a key={link.href} href={link.href} className={linkClass}>
          {link.label}
        </a>
      ))}
      <form action="/admin/logout" method="post" className="mt-auto pt-4">
        <button
          type="submit"
          className="w-full rounded px-3 py-2 text-left text-sm text-[var(--color-ink)]/70 hover:bg-[var(--color-cream)]"
        >
          Sign out
        </button>
      </form>
    </nav>
  );
}
