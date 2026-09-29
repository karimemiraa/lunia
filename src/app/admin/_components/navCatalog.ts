// The single source of truth for the staff menu: every page a staff member can
// reach from the sidebar, with the permission that gates it. Plain data (no
// icons, no "use client") so the sidebar, breadcrumbs, command palette and the
// superadmin "menu visibility" editor all agree on the same list.

import { PERMISSIONS, type PermissionKey } from "@/modules/iam/permissions";

export type NavIconKey =
  | "receipt"
  | "box"
  | "clipboard"
  | "phone"
  | "chat"
  | "clock"
  | "dashboard"
  | "chart"
  | "megaphone"
  | "report"
  | "calendar"
  | "users"
  | "image"
  | "content"
  | "layers"
  | "inbox"
  | "gear"
  | "tag"
  | "message"
  | "shield"
  | "giftcard"
  | "book"
  | "star"
  | "bell";

export interface NavCatalogItem {
  href: string;
  label: string;
  perm?: PermissionKey;
  icon: NavIconKey;
  /** Extra words the palette should match (synonyms staff actually type). */
  keywords?: string;
}
export interface NavCatalogGroup {
  label: string;
  items: NavCatalogItem[];
}

export const NAV_GROUPS: NavCatalogGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: "dashboard", keywords: "home today" },
      { href: "/admin/dashboard", label: "Business", perm: PERMISSIONS.ANALYTICS_VIEW, icon: "chart", keywords: "analytics revenue" },
      { href: "/admin/reports", label: "Reports", perm: PERMISSIONS.ANALYTICS_VIEW, icon: "report" },
      { href: "/admin/notifications", label: "Notifications", icon: "bell", keywords: "alerts attention" },
    ],
  },
  {
    label: "Customers",
    items: [
      { href: "/admin/clients", label: "Customers", perm: PERMISSIONS.CLIENT_VIEW, icon: "users", keywords: "clients patients" },
      { href: "/admin/leads", label: "Leads", perm: PERMISSIONS.CLIENT_VIEW, icon: "inbox", keywords: "pipeline" },
      { href: "/admin/callbacks", label: "Call-backs", perm: PERMISSIONS.CLIENT_VIEW, icon: "phone", keywords: "callbacks phone" },
      { href: "/admin/assistant", label: "Chat assistant", perm: PERMISSIONS.CLIENT_VIEW, icon: "chat", keywords: "sessions" },
      { href: "/admin/clinical/consents", label: "Consent forms", perm: PERMISSIONS.CLINICAL_MANAGE, icon: "clipboard" },
    ],
  },
  {
    label: "Scheduling",
    items: [
      { href: "/admin/calendar", label: "Calendar", perm: PERMISSIONS.BOOKING_VIEW, icon: "calendar", keywords: "bookings appointments" },
      { href: "/admin/waitlist", label: "Waitlist", perm: PERMISSIONS.BOOKING_VIEW, icon: "inbox" },
      { href: "/admin/booking/rooms", label: "Rooms", perm: PERMISSIONS.STAFF_MANAGE, icon: "book" },
      { href: "/admin/booking/schedules", label: "Schedules", perm: PERMISSIONS.STAFF_MANAGE, icon: "calendar", keywords: "shifts" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/admin/billing", label: "Invoices & payments", perm: PERMISSIONS.BILLING_MANAGE, icon: "receipt", keywords: "billing checkout" },
      { href: "/admin/accounting", label: "Accounting", perm: PERMISSIONS.ACCOUNTING_MANAGE, icon: "report", keywords: "vat cash" },
      { href: "/admin/accounting/expenses", label: "Expenses", perm: PERMISSIONS.ACCOUNTING_MANAGE, icon: "receipt" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/admin/inventory", label: "Products & stock", perm: PERMISSIONS.INVENTORY_MANAGE, icon: "box", keywords: "inventory" },
      { href: "/admin/inventory/purchase-orders", label: "Purchase orders", perm: PERMISSIONS.INVENTORY_MANAGE, icon: "clipboard" },
      { href: "/admin/inventory/suppliers", label: "Suppliers", perm: PERMISSIONS.INVENTORY_MANAGE, icon: "users" },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/admin/me", label: "My time & leave", icon: "clock", keywords: "clock in out attendance" },
      { href: "/admin/hr", label: "Employees", perm: PERMISSIONS.HR_MANAGE, icon: "users", keywords: "staff hr" },
      { href: "/admin/hr/attendance", label: "Attendance", perm: PERMISSIONS.HR_MANAGE, icon: "clock" },
      { href: "/admin/hr/leave", label: "Leave requests", perm: PERMISSIONS.HR_MANAGE, icon: "calendar" },
      { href: "/admin/hr/payroll", label: "Payroll", perm: PERMISSIONS.HR_MANAGE, icon: "receipt" },
    ],
  },
  {
    label: "Commerce",
    items: [
      { href: "/admin/commerce", label: "Gift cards & packages", perm: PERMISSIONS.SETTINGS_MANAGE, icon: "giftcard" },
      { href: "/admin/tiers", label: "Loyalty tiers", perm: PERMISSIONS.SETTINGS_MANAGE, icon: "tag" },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/admin/marketing", label: "Campaigns", perm: PERMISSIONS.ANALYTICS_VIEW, icon: "megaphone" },
      { href: "/admin/comms/broadcast", label: "Broadcast", perm: PERMISSIONS.MARKETING_MANAGE, icon: "megaphone" },
      { href: "/admin/whatsapp", label: "WhatsApp", perm: PERMISSIONS.CLIENT_MANAGE, icon: "message" },
      { href: "/admin/inquiries", label: "Inquiries", perm: PERMISSIONS.CMS_MANAGE, icon: "inbox", keywords: "contact form" },
      { href: "/admin/reviews", label: "Reviews", perm: PERMISSIONS.CMS_MANAGE, icon: "star" },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/media", label: "Media", perm: PERMISSIONS.CMS_MANAGE, icon: "image", keywords: "images photos" },
      { href: "/admin/content", label: "Content", perm: PERMISSIONS.CMS_MANAGE, icon: "content", keywords: "pages copy" },
      { href: "/admin/catalog", label: "Catalog", perm: PERMISSIONS.CMS_MANAGE, icon: "layers", keywords: "services departments" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/settings", label: "Settings", perm: PERMISSIONS.SETTINGS_MANAGE, icon: "gear" },
      { href: "/admin/comms", label: "Communications", perm: PERMISSIONS.SETTINGS_MANAGE, icon: "message", keywords: "email sms templates" },
      { href: "/admin/users", label: "Users", perm: PERMISSIONS.STAFF_MANAGE, icon: "users", keywords: "accounts logins" },
      { href: "/admin/roles", label: "Roles", perm: PERMISSIONS.STAFF_MANAGE, icon: "shield", keywords: "permissions" },
      { href: "/admin/audit", label: "Audit log", perm: PERMISSIONS.SETTINGS_MANAGE, icon: "shield" },
      { href: "/superadmin", label: "Superadmin", perm: PERMISSIONS.PLATFORM_MANAGE, icon: "gear", keywords: "platform integrations" },
    ],
  },
];

// Plain catalog of the menu (no icons/perms) for the superadmin "menu
// visibility" editor, so it always lists exactly what the sidebar can show.
export const NAV_CATALOG: { label: string; items: { href: string; label: string }[] }[] = NAV_GROUPS.map((g) => ({
  label: g.label,
  items: g.items.map((i) => ({ href: i.href, label: i.label })),
}));

/** Menu items visible to this viewer: permission-gated and minus hidden hrefs
 *  (the superadmin always sees everything — they are the one hiding things). */
export function visibleNavItems(permissions: Set<PermissionKey>, hiddenHrefs: string[] = []): (NavCatalogItem & { group: string })[] {
  const hidden = permissions.has(PERMISSIONS.PLATFORM_MANAGE) ? new Set<string>() : new Set(hiddenHrefs);
  return NAV_GROUPS.flatMap((g) =>
    g.items
      .filter((item) => (!item.perm || permissions.has(item.perm)) && !hidden.has(item.href))
      .map((item) => ({ ...item, group: g.label })),
  );
}

export interface PaletteAction {
  id: string;
  label: string;
  href: string;
  keywords?: string;
  hint?: string;
}

/** Quick actions for the command palette, gated like the pages they open. */
export function paletteActionsFor(permissions: Set<PermissionKey>, allowedHrefs: Set<string>): PaletteAction[] {
  const actions: PaletteAction[] = [];
  if (permissions.has(PERMISSIONS.BOOKING_MANAGE) && allowedHrefs.has("/admin/calendar")) {
    actions.push({ id: "new-booking", label: "New booking", href: "/admin/calendar?add=1", keywords: "walk-in appointment book", hint: "Opens today in the calendar" });
  }
  if (permissions.has(PERMISSIONS.BILLING_MANAGE) && allowedHrefs.has("/admin/billing")) {
    actions.push({ id: "new-invoice", label: "New walk-in invoice", href: "/admin/billing/new", keywords: "checkout sale bill pos", hint: "Blank invoice for a walk-in sale" });
  }
  if (permissions.has(PERMISSIONS.CLIENT_MANAGE) && allowedHrefs.has("/admin/clients")) {
    actions.push({ id: "add-lead", label: "Add lead", href: "/admin/clients", keywords: "new customer prospect", hint: "Customers, then the Add lead button" });
  }
  if (allowedHrefs.has("/admin/me")) {
    actions.push({ id: "clock", label: "Clock in / out", href: "/admin/me", keywords: "attendance time shift", hint: "My time & leave" });
  }
  actions.push({ id: "website", label: "Open website", href: "/", keywords: "site public home", hint: "Opens in a new tab" });
  return actions;
}
