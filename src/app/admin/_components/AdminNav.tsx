"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
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
};

function GlowMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <path
        fill="currentColor"
        d="M12 0c.6 4.8 2.6 8.2 6 9.6L24 12l-6 2.4c-3.4 1.4-5.4 4.8-6 9.6-.6-4.8-2.6-8.2-6-9.6L0 12l6-2.4C9.4 8.2 11.4 4.8 12 0Z"
      />
    </svg>
  );
}

const GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: I.dashboard },
      { href: "/admin/dashboard", label: "Business", perm: PERMISSIONS.ANALYTICS_VIEW, icon: I.chart },
      { href: "/admin/marketing", label: "Marketing", perm: PERMISSIONS.ANALYTICS_VIEW, icon: I.megaphone },
      { href: "/admin/reports", label: "Reports", perm: PERMISSIONS.ANALYTICS_VIEW, icon: I.report },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/calendar", label: "Calendar", perm: PERMISSIONS.BOOKING_VIEW, icon: I.calendar },
      { href: "/admin/clients", label: "Clients", perm: PERMISSIONS.CLIENT_VIEW, icon: I.users },
      { href: "/admin/booking/rooms", label: "Rooms", perm: PERMISSIONS.STAFF_MANAGE, icon: I.book },
      { href: "/admin/booking/schedules", label: "Schedules", perm: PERMISSIONS.STAFF_MANAGE, icon: I.calendar },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/media", label: "Media", perm: PERMISSIONS.CMS_MANAGE, icon: I.image },
      { href: "/admin/content", label: "Content", perm: PERMISSIONS.CMS_MANAGE, icon: I.content },
      { href: "/admin/catalog", label: "Catalog", perm: PERMISSIONS.CMS_MANAGE, icon: I.layers },
      { href: "/admin/inquiries", label: "Inquiries", perm: PERMISSIONS.CMS_MANAGE, icon: I.inbox },
    ],
  },
  {
    label: "Configuration",
    items: [
      { href: "/admin/settings", label: "Settings", perm: PERMISSIONS.SETTINGS_MANAGE, icon: I.gear },
      { href: "/admin/tiers", label: "Tiers", perm: PERMISSIONS.SETTINGS_MANAGE, icon: I.tag },
      { href: "/admin/commerce", label: "Gift cards & packages", perm: PERMISSIONS.SETTINGS_MANAGE, icon: I.giftcard },
      { href: "/admin/comms", label: "Communications", perm: PERMISSIONS.SETTINGS_MANAGE, icon: I.message },
      { href: "/admin/audit", label: "Audit Log", perm: PERMISSIONS.SETTINGS_MANAGE, icon: I.shield },
      { href: "/admin/roles", label: "Roles", perm: PERMISSIONS.STAFF_MANAGE, icon: I.users },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ permissions }: AdminNavProps) {
  // usePathname can be null (e.g. outside a router context in unit tests);
  // fall back to "" so isActive never dereferences null.
  const pathname = usePathname() ?? "";
  let order = 0;

  return (
    <nav
      aria-label="Admin navigation"
      className="sticky top-0 flex h-screen w-64 shrink-0 flex-col gap-2 overflow-y-auto border-e border-[var(--line)] bg-[var(--color-ink)] px-4 py-6 text-[var(--color-cream)]"
    >
      {/* Brand lockup */}
      <div className="mb-4 flex items-center gap-2.5 px-2">
        <GlowMark className="lunia-glow-pulse h-5 w-5 text-[var(--color-teal)]" />
        <span className="font-[family-name:var(--font-display)] text-xl tracking-[0.3em]">LUNIA</span>
        <span className="ms-auto rounded-full bg-[var(--color-teal)]/15 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-widest text-[var(--color-teal)]">
          Admin
        </span>
      </div>

      {GROUPS.map((group) => {
        const items = group.items.filter((item) => !item.perm || permissions.has(item.perm));
        if (items.length === 0) return null;
        return (
          <div key={group.label} className="mt-2">
            <p className="px-3 pb-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-[var(--color-cream)]/35">
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const active = isActive(pathname, item.href);
                order += 1;
                return (
                  <li key={item.href} className="lunia-animate-fade-in" style={{ animationDelay: `${order * 25}ms` }}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-sm transition-all duration-200 ${
                        active
                          ? "bg-[var(--color-teal)]/15 font-medium text-[var(--color-cream)]"
                          : "text-[var(--color-cream)]/70 hover:bg-white/5 hover:text-[var(--color-cream)]"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute inset-y-1 -start-4 w-1 rounded-e-full bg-[var(--color-teal)] transition-transform duration-300 ${
                          active ? "scale-y-100" : "scale-y-0"
                        }`}
                      />
                      <span className={active ? "text-[var(--color-teal)]" : "text-[var(--color-cream)]/55 transition-colors group-hover:text-[var(--color-teal)]"}>
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <form action="/admin/logout" method="post" className="mt-auto pt-4">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--color-cream)]/60 transition-colors hover:bg-white/5 hover:text-[var(--color-cream)]"
        >
          <span className="text-[var(--color-cream)]/50">{I.door}</span>
          Sign out
        </button>
      </form>
    </nav>
  );
}
