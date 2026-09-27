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
  receipt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <path strokeLinejoin="round" d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path strokeLinecap="round" d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  ),
  box: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <path strokeLinejoin="round" d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path strokeLinejoin="round" d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </svg>
  ),
  clipboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <rect x="5" y="4.5" width="14" height="16.5" rx="2" /><path strokeLinecap="round" d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h3" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <path strokeLinejoin="round" d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <path strokeLinejoin="round" d="M4 5h16v11H9l-5 4z" /><path strokeLinecap="round" d="M8 9.5h8M8 12.5h5" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={ic}>
      <circle cx="12" cy="12" r="8.5" /><path strokeLinecap="round" d="M12 7.5V12l3 2" />
    </svg>
  ),
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
      { href: "/admin/leads", label: "Leads", perm: PERMISSIONS.CLIENT_VIEW, icon: I.inbox },
      { href: "/admin/callbacks", label: "Call-backs", perm: PERMISSIONS.CLIENT_VIEW, icon: I.phone },
      { href: "/admin/assistant", label: "Chat assistant", perm: PERMISSIONS.CLIENT_VIEW, icon: I.chat },
      { href: "/admin/clinical/consents", label: "Consent forms", perm: PERMISSIONS.CLINICAL_MANAGE, icon: I.clipboard },
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
    label: "Finance",
    items: [
      { href: "/admin/billing", label: "Invoices & payments", perm: PERMISSIONS.BILLING_MANAGE, icon: I.receipt },
      { href: "/admin/accounting", label: "Accounting", perm: PERMISSIONS.ACCOUNTING_MANAGE, icon: I.report },
      { href: "/admin/accounting/expenses", label: "Expenses", perm: PERMISSIONS.ACCOUNTING_MANAGE, icon: I.receipt },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/admin/inventory", label: "Products & stock", perm: PERMISSIONS.INVENTORY_MANAGE, icon: I.box },
      { href: "/admin/inventory/purchase-orders", label: "Purchase orders", perm: PERMISSIONS.INVENTORY_MANAGE, icon: I.clipboard },
      { href: "/admin/inventory/suppliers", label: "Suppliers", perm: PERMISSIONS.INVENTORY_MANAGE, icon: I.users },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/admin/me", label: "My time & leave", icon: I.clock },
      { href: "/admin/hr", label: "Employees", perm: PERMISSIONS.HR_MANAGE, icon: I.users },
      { href: "/admin/hr/attendance", label: "Attendance", perm: PERMISSIONS.HR_MANAGE, icon: I.clock },
      { href: "/admin/hr/leave", label: "Leave requests", perm: PERMISSIONS.HR_MANAGE, icon: I.calendar },
      { href: "/admin/hr/payroll", label: "Payroll", perm: PERMISSIONS.HR_MANAGE, icon: I.receipt },
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
      { href: "/admin/comms/broadcast", label: "Broadcast", perm: PERMISSIONS.MARKETING_MANAGE, icon: I.megaphone },
      { href: "/admin/whatsapp", label: "WhatsApp", perm: PERMISSIONS.CLIENT_MANAGE, icon: I.message },
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
      { href: "/admin/users", label: "Users", perm: PERMISSIONS.STAFF_MANAGE, icon: I.users },
      { href: "/admin/roles", label: "Roles", perm: PERMISSIONS.STAFF_MANAGE, icon: I.shield },
      { href: "/admin/audit", label: "Audit log", perm: PERMISSIONS.SETTINGS_MANAGE, icon: I.shield },
      { href: "/superadmin", label: "Superadmin", perm: PERMISSIONS.PLATFORM_MANAGE, icon: I.gear },
    ],
  },
];

function matches(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ALL_HREFS = GROUPS.flatMap((g) => g.items.map((i) => i.href));

// Only the most specific matching item is active, so /admin/accounting/expenses
// highlights "Expenses" and not also "Accounting".
function isActive(pathname: string, href: string): boolean {
  if (!matches(pathname, href)) return false;
  return !ALL_HREFS.some((other) => other !== href && other.length > href.length && matches(pathname, other));
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
  // Phones: the nav is an off-canvas drawer opened from the top bar.
  const [drawerOpen, setDrawerOpen] = useState(false);
  // In the open drawer always show full labels; elsewhere honour the rail.
  const rail = collapsed && !drawerOpen;

  // Hydrate persisted UI state after mount (avoids SSR/client mismatch).
  // With no saved preference, tablets in portrait start with the icon rail so
  // the content keeps its width on an iPad.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lunia-nav-collapsed");
      setCollapsed(saved === null ? window.innerWidth < 1024 : saved === "1");
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
    <>
    {/* Phone top bar (the sidebar becomes a drawer below md). */}
    <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-white/10 bg-[var(--color-ink)] px-3 pt-[env(safe-area-inset-top)] text-[var(--color-cream)] md:hidden">
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
        aria-expanded={drawerOpen}
        className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-white/10"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
          <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <span className="font-[family-name:var(--font-display)] text-lg tracking-[0.3em]">LUNIA</span>
    </div>
    {drawerOpen && (
      <div aria-hidden="true" onClick={() => setDrawerOpen(false)} className="fixed inset-0 z-40 bg-black/40 md:hidden" />
    )}
    <nav
      aria-label="Admin navigation"
      className={`fixed inset-y-0 start-0 z-50 flex h-[100dvh] w-72 shrink-0 flex-col gap-0.5 overflow-y-auto overflow-x-hidden border-e border-[var(--line)] bg-[var(--color-ink)] px-3 py-4 text-[var(--color-cream)] transition-transform duration-300 md:sticky md:top-0 md:z-auto md:h-screen md:translate-x-0 md:transition-[width] ${
        drawerOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
      } ${collapsed ? "md:w-[4.25rem] md:items-center md:px-2" : "md:w-60 md:px-3"}`}
    >
      {/* Brand + collapse toggle */}
      <div className={`mb-3 flex items-center ${rail ? "justify-center" : "gap-2 px-2"}`}>
        {!rail && (
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
          className={`hidden rounded-md p-1.5 text-[var(--color-cream)]/55 transition-colors hover:bg-white/10 hover:text-[var(--color-cream)] md:inline-flex ${rail ? "" : "ms-1"}`}
        >
          {RailIcon}
        </button>
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label="Close menu"
          className="ms-1 flex h-10 w-10 items-center justify-center rounded-md text-[var(--color-cream)]/70 hover:bg-white/10 md:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">
            <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      {GROUPS.map((group) => {
        const items = group.items.filter((item) => !item.perm || permissions.has(item.perm));
        if (items.length === 0) return null;
        const open = rail ? true : !closed[group.label];
        return (
          <div key={group.label} className="w-full">
            {rail ? (
              <div aria-hidden="true" className="mx-auto my-2 h-px w-6 bg-white/10" />
            ) : (
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={open}
                className="mt-3 flex w-full items-center justify-between rounded px-3 py-1 text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-cream)]/55 transition-colors hover:text-[var(--color-cream)]/80"
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
                        title={rail ? item.label : undefined}
                        onClick={() => setDrawerOpen(false)}
                        className={`group flex items-center rounded-[var(--radius-sm)] text-sm transition-colors duration-200 ${
                          rail ? "justify-center p-2.5" : "gap-3 px-3 py-2.5 md:py-1.5"
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
                        {!rail && item.label}
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
          title={rail ? "Sign out" : undefined}
          className={`flex w-full items-center rounded-[var(--radius-sm)] text-sm text-[var(--color-cream)]/60 transition-colors hover:bg-white/5 hover:text-[var(--color-cream)] ${
            rail ? "justify-center p-2.5" : "gap-3 px-3 py-2"
          }`}
        >
          <span className="text-[var(--color-cream)]/50">{I.door}</span>
          {!rail && "Sign out"}
        </button>
      </form>
    </nav>
    </>
  );
}
