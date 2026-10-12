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
  /**
   * Href of the item this one tucks under in the sidebar (a sub-page shown
   * when its parent's section is open). If the viewer can't see the parent,
   * the item simply shows at the top level of its group.
   */
  parent?: string;
}
export interface NavCatalogGroup {
  label: string;
  items: NavCatalogItem[];
}

// Six task-based groups instead of ten department lists: the pages people use
// every day are top-level, related/occasional pages tuck under them.
export const NAV_GROUPS: NavCatalogGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: "dashboard", keywords: "home today" },
      { href: "/admin/notifications", label: "Notifications", icon: "bell", keywords: "alerts attention", parent: "/admin" },
    ],
  },
  {
    label: "Front desk",
    items: [
      { href: "/admin/calendar", label: "Calendar", perm: PERMISSIONS.BOOKING_VIEW, icon: "calendar", keywords: "bookings appointments" },
      { href: "/admin/waitlist", label: "Waitlist", perm: PERMISSIONS.BOOKING_VIEW, icon: "inbox", parent: "/admin/calendar" },
      { href: "/admin/booking/rooms", label: "Rooms", perm: PERMISSIONS.STAFF_MANAGE, icon: "book", parent: "/admin/calendar" },
      { href: "/admin/booking/schedules", label: "Schedules", perm: PERMISSIONS.STAFF_MANAGE, icon: "calendar", keywords: "shifts", parent: "/admin/calendar" },
      { href: "/admin/clients", label: "Customers", perm: PERMISSIONS.CLIENT_VIEW, icon: "users", keywords: "clients patients" },
      { href: "/admin/leads", label: "Leads", perm: PERMISSIONS.CLIENT_VIEW, icon: "inbox", keywords: "pipeline", parent: "/admin/clients" },
      { href: "/admin/callbacks", label: "Call-backs", perm: PERMISSIONS.CLIENT_VIEW, icon: "phone", keywords: "callbacks phone", parent: "/admin/clients" },
      { href: "/admin/clinical/consents", label: "Consent forms", perm: PERMISSIONS.CLINICAL_MANAGE, icon: "clipboard", parent: "/admin/clients" },
      { href: "/admin/whatsapp", label: "WhatsApp", perm: PERMISSIONS.CLIENT_MANAGE, icon: "message", keywords: "messages inbox chat" },
      { href: "/admin/inquiries", label: "Inquiries", perm: PERMISSIONS.CMS_MANAGE, icon: "inbox", keywords: "contact form", parent: "/admin/whatsapp" },
      { href: "/admin/assistant", label: "Chat assistant", perm: PERMISSIONS.CLIENT_VIEW, icon: "chat", keywords: "sessions website bot", parent: "/admin/whatsapp" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/admin/billing", label: "Invoices & payments", perm: PERMISSIONS.BILLING_MANAGE, icon: "receipt", keywords: "billing checkout" },
      { href: "/admin/accounting", label: "Accounting", perm: PERMISSIONS.ACCOUNTING_MANAGE, icon: "report", keywords: "vat cash" },
      { href: "/admin/accounting/expenses", label: "Expenses", perm: PERMISSIONS.ACCOUNTING_MANAGE, icon: "receipt", parent: "/admin/accounting" },
      { href: "/admin/commerce", label: "Gift cards & packages", perm: PERMISSIONS.SETTINGS_MANAGE, icon: "giftcard", keywords: "vouchers memberships" },
      { href: "/admin/tiers", label: "Loyalty tiers", perm: PERMISSIONS.SETTINGS_MANAGE, icon: "tag", keywords: "points vip", parent: "/admin/commerce" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/inventory", label: "Products & stock", perm: PERMISSIONS.INVENTORY_MANAGE, icon: "box", keywords: "inventory" },
      { href: "/admin/inventory/purchase-orders", label: "Purchase orders", perm: PERMISSIONS.INVENTORY_MANAGE, icon: "clipboard", parent: "/admin/inventory" },
      { href: "/admin/inventory/suppliers", label: "Suppliers", perm: PERMISSIONS.INVENTORY_MANAGE, icon: "users", parent: "/admin/inventory" },
      { href: "/admin/me", label: "My time & leave", icon: "clock", keywords: "clock in out attendance" },
      { href: "/admin/hr", label: "Employees", perm: PERMISSIONS.HR_MANAGE, icon: "users", keywords: "staff hr team" },
      { href: "/admin/hr/attendance", label: "Attendance", perm: PERMISSIONS.HR_MANAGE, icon: "clock", parent: "/admin/hr" },
      { href: "/admin/hr/leave", label: "Leave requests", perm: PERMISSIONS.HR_MANAGE, icon: "calendar", parent: "/admin/hr" },
      { href: "/admin/hr/payroll", label: "Payroll", perm: PERMISSIONS.HR_MANAGE, icon: "receipt", parent: "/admin/hr" },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/admin/dashboard", label: "Business", perm: PERMISSIONS.ANALYTICS_VIEW, icon: "chart", keywords: "analytics revenue kpi" },
      { href: "/admin/reports", label: "Reports", perm: PERMISSIONS.ANALYTICS_VIEW, icon: "report", parent: "/admin/dashboard" },
      { href: "/admin/marketing", label: "Campaigns", perm: PERMISSIONS.ANALYTICS_VIEW, icon: "megaphone" },
      { href: "/admin/comms/broadcast", label: "Broadcast", perm: PERMISSIONS.MARKETING_MANAGE, icon: "megaphone", parent: "/admin/marketing" },
      { href: "/admin/reviews", label: "Reviews", perm: PERMISSIONS.CMS_MANAGE, icon: "star", parent: "/admin/marketing" },
      { href: "/admin/content", label: "Website", perm: PERMISSIONS.CMS_MANAGE, icon: "content", keywords: "content pages copy cms" },
      { href: "/admin/catalog", label: "Catalog", perm: PERMISSIONS.CMS_MANAGE, icon: "layers", keywords: "services departments brands blog", parent: "/admin/content" },
      { href: "/admin/media", label: "Media", perm: PERMISSIONS.CMS_MANAGE, icon: "image", keywords: "images photos", parent: "/admin/content" },
      { href: "/admin/content/results", label: "Results gallery", perm: PERMISSIONS.CLINICAL_MANAGE, icon: "image", keywords: "before after photos showcase", parent: "/admin/content" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/settings", label: "Settings", perm: PERMISSIONS.SETTINGS_MANAGE, icon: "gear" },
      { href: "/admin/comms", label: "Communications", perm: PERMISSIONS.SETTINGS_MANAGE, icon: "message", keywords: "email sms templates", parent: "/admin/settings" },
      { href: "/admin/requests", label: "Edit requests", perm: PERMISSIONS.SETTINGS_MANAGE, icon: "inbox", keywords: "change requests suggestions team feedback", parent: "/admin/settings" },
      { href: "/admin/audit", label: "Audit log", perm: PERMISSIONS.SETTINGS_MANAGE, icon: "shield", parent: "/admin/settings" },
      { href: "/admin/users", label: "Users", perm: PERMISSIONS.STAFF_MANAGE, icon: "users", keywords: "accounts logins" },
      { href: "/admin/roles", label: "Roles", perm: PERMISSIONS.STAFF_MANAGE, icon: "shield", keywords: "permissions", parent: "/admin/users" },
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
    actions.push({ id: "add-lead", label: "Add lead", href: "/admin/clients?add=lead", keywords: "new customer prospect", hint: "Opens the Add lead form" });
  }
  if (allowedHrefs.has("/admin/me")) {
    actions.push({ id: "clock", label: "Clock in / out", href: "/admin/me", keywords: "attendance time shift", hint: "My time & leave" });
  }
  actions.push({ id: "website", label: "Open website", href: "/", keywords: "site public home", hint: "Opens in a new tab" });
  return actions;
}
