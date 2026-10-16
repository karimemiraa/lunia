export const PERMISSIONS = {
  BOOKING_MANAGE: "booking:manage",
  BOOKING_VIEW: "booking:view",
  CLIENT_MANAGE: "client:manage",
  CLIENT_VIEW: "client:view",
  VISITNOTE_WRITE: "visitnote:write",
  CATALOG_MANAGE: "catalog:manage",
  CMS_MANAGE: "cms:manage",
  ANALYTICS_VIEW: "analytics:view",
  MARKETING_MANAGE: "marketing:manage",
  STAFF_MANAGE: "staff:manage",
  SETTINGS_MANAGE: "settings:manage",
  // Patient file: medical history, consents, treatment records, clinical photos.
  CLINICAL_MANAGE: "clinical:manage",
  // Front-desk billing: create/issue invoices, take payments, send pay links.
  BILLING_MANAGE: "billing:manage",
  // Back office: expenses, cash-drawer close, VAT & P&L reports, ZATCA setup.
  ACCOUNTING_MANAGE: "accounting:manage",
  INVENTORY_MANAGE: "inventory:manage",
  // Employee files, attendance, leave approvals and payroll.
  HR_MANAGE: "hr:manage",
  // Specialist discounts on her own visits, up to the cap in Settings → Discounts.
  DISCOUNT_GIVE: "discount:give",
  // Approve discounts above the cap.
  DISCOUNT_APPROVE: "discount:approve",
  // Superadmin-only platform/technical control (email/WhatsApp/payment/AI/API
  // credential setup). Deliberately EXCLUDED from ALL_PERMISSION_KEYS below so
  // it is never granted by the "all permissions" roles (admin) nor offered in
  // the roles editor — only the seeded owner account holds it.
  PLATFORM_MANAGE: "platform:manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
// Every assignable permission — excludes PLATFORM_MANAGE (owner-only, see above).
export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS).filter(
  (k) => k !== PERMISSIONS.PLATFORM_MANAGE,
);

// Human-readable labels for the admin roles UI (client-safe: no server deps).
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  "booking:view": "View bookings & calendar",
  "booking:manage": "Manage bookings (book, check-in, cancel)",
  "client:view": "View customers",
  "client:manage": "Manage customers & pipeline",
  "visitnote:write": "Write comments & activities",
  "catalog:manage": "Manage catalog (services, brands)",
  "cms:manage": "Manage content, media & inquiries",
  "analytics:view": "View reports & analytics",
  "marketing:manage": "Manage marketing & campaigns",
  "staff:manage": "Manage users & roles",
  "settings:manage": "Manage settings & communications",
  "clinical:manage": "Patient file (medical history, consents, treatment records, photos)",
  "billing:manage": "Billing (invoices, payments, pay links)",
  "accounting:manage": "Accounting (expenses, cash close, VAT & P&L)",
  "inventory:manage": "Inventory (products, stock, suppliers, purchase orders)",
  "hr:manage": "HR & payroll (employees, attendance, leave, payroll)",
  "discount:give": "Give discounts on own visits (up to the limit)",
  "discount:approve": "Approve discounts above the limit",
  "platform:manage": "Superadmin: platform & integrations",
};

// Grouped for a compact, scannable permissions editor.
export const PERMISSION_GROUPS: { label: string; keys: PermissionKey[] }[] = [
  { label: "Scheduling", keys: ["booking:view", "booking:manage"] },
  { label: "Customers", keys: ["client:view", "client:manage", "visitnote:write", "clinical:manage"] },
  { label: "Finance & stock", keys: ["billing:manage", "discount:give", "discount:approve", "accounting:manage", "inventory:manage"] },
  { label: "Growth", keys: ["analytics:view", "marketing:manage"] },
  { label: "Content", keys: ["catalog:manage", "cms:manage"] },
  { label: "System", keys: ["staff:manage", "settings:manage", "hr:manage"] },
];

export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  // Owner is the superadmin: every assignable permission PLUS platform:manage.
  owner: [...ALL_PERMISSION_KEYS, PERMISSIONS.PLATFORM_MANAGE],
  // Full administrative access (distinct from the singular Owner account).
  admin: ALL_PERMISSION_KEYS,
  // Clinic manager: runs the floor, money, stock, prices and the team's access
  // (but can't grant more than she holds — see grantableBy). HR, settings and
  // the website stay with owner/admin.
  manager: [
    PERMISSIONS.BOOKING_MANAGE,
    PERMISSIONS.BOOKING_VIEW,
    PERMISSIONS.CLIENT_MANAGE,
    PERMISSIONS.CLIENT_VIEW,
    PERMISSIONS.VISITNOTE_WRITE,
    PERMISSIONS.CLINICAL_MANAGE,
    PERMISSIONS.CATALOG_MANAGE,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.STAFF_MANAGE,
    PERMISSIONS.BILLING_MANAGE,
    PERMISSIONS.DISCOUNT_GIVE,
    PERMISSIONS.DISCOUNT_APPROVE,
    PERMISSIONS.ACCOUNTING_MANAGE,
    PERMISSIONS.INVENTORY_MANAGE,
  ],
  // Front desk: books, checks in, takes payment, sells gift cards/packages,
  // leaves notes. No medical file (consent signing at the desk uses booking:manage).
  reception: [
    PERMISSIONS.BOOKING_MANAGE,
    PERMISSIONS.BOOKING_VIEW,
    PERMISSIONS.CLIENT_MANAGE,
    PERMISSIONS.CLIENT_VIEW,
    PERMISSIONS.VISITNOTE_WRITE,
    PERMISSIONS.BILLING_MANAGE,
  ],
  // Skin specialist: her customers, the patient file, notes, capped discounts.
  specialist: [
    PERMISSIONS.BOOKING_VIEW,
    PERMISSIONS.CLIENT_VIEW,
    PERMISSIONS.VISITNOTE_WRITE,
    PERMISSIONS.CLINICAL_MANAGE,
    PERMISSIONS.DISCOUNT_GIVE,
  ],
  // Website, journal, media, inquiries, reviews and campaigns. Services and
  // prices belong to the catalog permission (manager).
  marketing: [PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.MARKETING_MANAGE, PERMISSIONS.CMS_MANAGE],
  // Sales: books and manages customers, takes payment, sees performance.
  sales: [
    PERMISSIONS.BOOKING_MANAGE,
    PERMISSIONS.BOOKING_VIEW,
    PERMISSIONS.CLIENT_MANAGE,
    PERMISSIONS.CLIENT_VIEW,
    PERMISSIONS.VISITNOTE_WRITE,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.BILLING_MANAGE,
  ],
  // Telesales: phone outreach — manages customers and bookings, runs campaigns.
  telesales: [
    PERMISSIONS.CLIENT_MANAGE,
    PERMISSIONS.CLIENT_VIEW,
    PERMISSIONS.BOOKING_MANAGE,
    PERMISSIONS.BOOKING_VIEW,
    PERMISSIONS.VISITNOTE_WRITE,
    PERMISSIONS.MARKETING_MANAGE,
    PERMISSIONS.ANALYTICS_VIEW,
  ],
};

/**
 * No privilege escalation through the roles/users editors: an editor may only
 * add or remove permissions she holds herself. Returns the keys she tried to
 * change but doesn't hold (empty = allowed).
 */
export function ungrantableChanges(editorPerms: Iterable<string>, before: Iterable<string>, after: Iterable<string>): string[] {
  const held = new Set(editorPerms);
  const b = new Set(before);
  const a = new Set(after);
  const changed = [...[...a].filter((k) => !b.has(k)), ...[...b].filter((k) => !a.has(k))];
  return changed.filter((k) => !held.has(k));
}
