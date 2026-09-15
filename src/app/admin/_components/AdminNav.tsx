"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PERMISSIONS, type PermissionKey } from "@/modules/iam/permissions";

interface AdminNavProps {
  permissions: Set<PermissionKey>;
}

interface NavItem {
  href: string;
  label: string;
  perm?: PermissionKey;
  icon: ReactNode;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

// --- compact stroke icons (18px) ---------------------------------------
const ic = "h-[1.15rem] w-[1.15rem] shrink-0";
const I = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <path strokeLinecap="round" d="M4 20V4M4 20h16" /><path strokeLinecap="round" d="M8 16v-4M12 16V8M16 16v-6" />
    </svg>
  ),
  megaphone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <path strokeLinejoin="round" d="M4 10v4a1 1 0 0 0 1 1h2l7 4V5L7 9H5a1 1 0 0 0-1 1Z" /><path strokeLinecap="round" d="M18 9a4 4 0 0 1 0 6" />
    </svg>
  ),
  report: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <path strokeLinejoin="round" d="M6 3h8l4 4v14H6z" /><path strokeLinecap="round" d="M14 3v4h4M9 13h6M9 17h6" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" /><path strokeLinecap="round" d="M3.5 9h17M8 3v4M16 3v4" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <circle cx="9" cy="8" r="3.2" /><path strokeLinecap="round" d="M3.5 20a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.5M20.5 20a4.8 4.8 0 0 0-3-4.4" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.6" /><path strokeLinejoin="round" d="m4 18 5-5 4 4 3-3 4 4" />
    </svg>
  ),
  content: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <rect x="4" y="3.5" width="16" height="17" rx="2" /><path strokeLinecap="round" d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  layers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <path strokeLinejoin="round" d="m12 3 8 4-8 4-8-4 8-4Z" /><path strokeLinecap="round" strokeLinejoin="round" d="m4 12 8 4 8-4M4 17l8 4 8-4" />
    </svg>
  ),
  inbox: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <path strokeLinejoin="round" d="M4 13 6 5h12l2 8v6H4z" /><path strokeLinecap="round" d="M4 13h4a2 2 0 0 0 4 0h0a2 2 0 0 0 4 0h4" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <circle cx="12" cy="12" r="3" /><path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </svg>
  ),
  tag: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <path strokeLinejoin="round" d="M4 4h7l9 9-7 7-9-9V4Z" /><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  ),
  message: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <path strokeLinejoin="round" d="M4 5h16v11H9l-5 4V5Z" /><path strokeLinecap="round" d="M8 9h8M8 12.5h5" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <path strokeLinejoin="round" d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" /><path strokeLinecap="round" d="m9 12 2 2 4-4" />
    </svg>
  ),
  giftcard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <rect x="2.5" y="7" width="19" height="13" rx="2" /><path strokeLinecap="round" d="M2.5 12h19M12 7v13" />
      <path strokeLinejoin="round" d="M12 7c-1.2-3-3.4-4-4.7-2.8C6 5.4 7 7 9 7h3ZM12 7c1.2-3 3.4-4 4.7-2.8C18 5.4 17 7 15 7h-3Z" />
    </svg>
  ),
  book: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <path strokeLinejoin="round" d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4Z" /><path strokeLinecap="round" d="M17 7h2v13h-2" />
    </svg>
  ),
  door: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 4H6v16h8M14 12h7m0 0-3-3m3 3-3 3" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <path strokeLinejoin="round" d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7L12 3Z" />
    </svg>
  ),
};

const GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: I.dashboard },
      { href: "/admin/dashboard", label: "Business", perm: PERMISSIONS.ANALYTICS_VIEW, icon: I.chart },
      { href: "/admin/reports", label: "Reports", perm: PERMISSIONS.ANALYTICS_VIEW, icon: I.report },
    ],
  },
  {
    label: "Customers",
    items: [
      { href: "/admin/clients", label: "Customers", perm: PERMISSIONS.CLIENT_VIEW, icon: I.users },
    ],
  },
  {
    label: "Scheduling",
    items: [
      { href: "/admin/calendar", label: "Calendar", perm: PERMISSIONS.BOOKING_VIEW, icon: I.calendar },
      { href: "/admin/waitlist", label: "Waitlist", perm: PERMISSIONS.BOOKING_VIEW, icon: I.inbox },
      { href: "/admin/booking/rooms", label: "Rooms", perm: PERMISSIONS.STAFF_MANAGE, icon: I.book },
      { href: "/admin/booking/schedules", label: "Schedules", perm: PERMISSIONS.STAFF_MANAGE, icon: I.calendar },
    ],
  },
  {
    label: "Commerce",
    items: [
      { href: "/admin/commerce", label: "Gift cards & packages", perm: PERMISSIONS.SETTINGS_MANAGE, icon: I.giftcard },
      { href: "/admin/tiers", label: "Loyalty tiers", perm: PERMISSIONS.SETTINGS_MANAGE, icon: I.tag },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/admin/marketing", label: "Campaigns", perm: PERMISSIONS.ANALYTICS_VIEW, icon: I.megaphone },
      { href: "/admin/inquiries", label: "Inquiries", perm: PERMISSIONS.CMS_MANAGE, icon: I.inbox },
      { href: "/admin/reviews", label: "Reviews", perm: PERMISSIONS.CMS_MANAGE, icon: I.star },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/media", label: "Media", perm: PERMISSIONS.CMS_MANAGE, icon: I.image },
      { href: "/admin/content", label: "Content", perm: PERMISSIONS.CMS_MANAGE, icon: I.content },
      { href: "/admin/catalog", label: "Catalog", perm: PERMISSIONS.CMS_MANAGE, icon: I.layers },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/settings", label: "Settings", perm: PERMISSIONS.SETTINGS_MANAGE, icon: I.gear },
      { href: "/admin/comms", label: "Communications", perm: PERMISSIONS.SETTINGS_MANAGE, icon: I.message },
      { href: "/admin/roles", label: "Roles", perm: PERMISSIONS.STAFF_MANAGE, icon: I.users },
      { href: "/admin/audit", label: "Audit log", perm: PERMISSIONS.SETTINGS_MANAGE, icon: I.shield },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`h-3 w-3 shrink-0 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  );
}

const RailIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[1.15rem] w-[1.15rem]">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path strokeLinecap="round" d="M9.5 4.5v15" />
  </svg>
);

export function AdminNav({ permissions }: AdminNavProps) {
  // usePathname can be null (e.g. outside a router context in unit tests);
  // fall back to "" so isActive never dereferences null.
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState(false);
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  // Hydrate persisted UI state after mount (avoids SSR/client mismatch).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("lunia-nav-collapsed") === "1");
      const raw = localStorage.getItem("lunia-nav-closed");
      if (raw) setClosed(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* localStorage unavailable — use defaults */
    }
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("lunia-nav-collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });

  const toggleGroup = (label: string) =>
    setClosed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try {
        localStorage.setItem("lunia-nav-closed", JSON.stringify(next));
      } catch {}
      return next;
    });

  return (
    <nav
      aria-label="Admin navigation"
      className={`sticky top-0 flex h-screen shrink-0 flex-col gap-0.5 overflow-y-auto overflow-x-hidden border-e border-[var(--line)] bg-[var(--color-ink)] py-4 text-[var(--color-cream)] transition-[width] duration-300 ${
        collapsed ? "w-[4.25rem] items-center px-2" : "w-60 px-3"
      }`}
    >
      {/* Brand + collapse toggle */}
      <div className={`mb-3 flex items-center ${collapsed ? "justify-center" : "gap-2 px-2"}`}>
        {!collapsed && (
          <>
            <span className="font-[family-name:var(--font-display)] text-lg tracking-[0.3em]">LUNIA</span>
            <span className="ms-auto rounded-full bg-[var(--color-teal)]/15 px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-widest text-[var(--color-teal)]">
              Admin
            </span>
          </>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`rounded-md p-1.5 text-[var(--color-cream)]/55 transition-colors hover:bg-white/10 hover:text-[var(--color-cream)] ${collapsed ? "" : "ms-1"}`}
        >
          {RailIcon}
        </button>
      </div>

      {GROUPS.map((group) => {
        const items = group.items.filter((item) => !item.perm || permissions.has(item.perm));
        if (items.length === 0) return null;
        const open = collapsed ? true : !closed[group.label];
        return (
          <div key={group.label} className="w-full">
            {collapsed ? (
              <div aria-hidden="true" className="mx-auto my-2 h-px w-6 bg-white/10" />
            ) : (
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={open}
                className="mt-2 flex w-full items-center justify-between rounded px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-[var(--color-cream)]/35 transition-colors hover:text-[var(--color-cream)]/70"
              >
                {group.label}
                <Chevron open={open} />
              </button>
            )}
            {open && (
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                        className={`group flex items-center rounded-[var(--radius-sm)] text-sm transition-colors duration-200 ${
                          collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-1.5"
                        } ${
                          active
                            ? "bg-[var(--color-teal)]/15 font-medium text-[var(--color-cream)]"
                            : "text-[var(--color-cream)]/70 hover:bg-white/5 hover:text-[var(--color-cream)]"
                        }`}
                      >
                        <span
                          className={
                            active
                              ? "text-[var(--color-teal)]"
                              : "text-[var(--color-cream)]/55 transition-colors group-hover:text-[var(--color-teal)]"
                          }
                        >
                          {item.icon}
                        </span>
                        {!collapsed && item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      <form action="/admin/logout" method="post" className="mt-auto w-full pt-3">
        <button
          type="submit"
          title={collapsed ? "Sign out" : undefined}
          className={`flex w-full items-center rounded-[var(--radius-sm)] text-sm text-[var(--color-cream)]/60 transition-colors hover:bg-white/5 hover:text-[var(--color-cream)] ${
            collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2"
          }`}
        >
          <span className="text-[var(--color-cream)]/50">{I.door}</span>
          {!collapsed && "Sign out"}
        </button>
      </form>
    </nav>
  );
}
