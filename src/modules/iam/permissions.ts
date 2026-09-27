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
  "platform:manage": "Superadmin: platform & integrations",
};

// Grouped for a compact, scannable permissions editor.
export const PERMISSION_GROUPS: { label: string; keys: PermissionKey[] }[] = [
  { label: "Scheduling", keys: ["booking:view", "booking:manage"] },
  { label: "Customers", keys: ["client:view", "client:manage", "visitnote:write", "clinical:manage"] },
  { label: "Finance & stock", keys: ["billing:manage", "accounting:manage", "inventory:manage"] },
  { label: "Growth", keys: ["analytics:view", "marketing:manage"] },
  { label: "Content", keys: ["catalog:manage", "cms:manage"] },
  { label: "System", keys: ["staff:manage", "settings:manage", "hr:manage"] },
];

export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  // Owner is the superadmin: every assignable permission PLUS platform:manage.
  owner: [...ALL_PERMISSION_KEYS, PERMISSIONS.PLATFORM_MANAGE],
  manager: [
    PERMISSIONS.BOOKING_MANAGE,
    PERMISSIONS.BOOKING_VIEW,
    PERMISSIONS.CLIENT_MANAGE,
    PERMISSIONS.CLIENT_VIEW,
    PERMISSIONS.CATALOG_MANAGE,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.STAFF_MANAGE,
    PERMISSIONS.CLINICAL_MANAGE,
    PERMISSIONS.BILLING_MANAGE,
    PERMISSIONS.ACCOUNTING_MANAGE,
    PERMISSIONS.INVENTORY_MANAGE,
  ],
  reception: [
    PERMISSIONS.BOOKING_MANAGE,
    PERMISSIONS.BOOKING_VIEW,
    PERMISSIONS.CLIENT_MANAGE,
    PERMISSIONS.CLIENT_VIEW,
    PERMISSIONS.BILLING_MANAGE,
  ],
  specialist: [PERMISSIONS.BOOKING_VIEW, PERMISSIONS.CLIENT_VIEW, PERMISSIONS.VISITNOTE_WRITE, PERMISSIONS.CLINICAL_MANAGE],
  marketing: [PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.MARKETING_MANAGE, PERMISSIONS.CMS_MANAGE],
  // Full administrative access (distinct from the singular Owner account).
  admin: ALL_PERMISSION_KEYS,
  // Sales: books and manages customers, sees performance.
  sales: [
    PERMISSIONS.BOOKING_MANAGE,
    PERMISSIONS.BOOKING_VIEW,
    PERMISSIONS.CLIENT_MANAGE,
    PERMISSIONS.CLIENT_VIEW,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.BILLING_MANAGE,
  ],
  // Telesales: phone outreach — manages customers and bookings, runs campaigns.
  telesales: [
    PERMISSIONS.CLIENT_MANAGE,
    PERMISSIONS.CLIENT_VIEW,
    PERMISSIONS.BOOKING_MANAGE,
    PERMISSIONS.BOOKING_VIEW,
    PERMISSIONS.MARKETING_MANAGE,
    PERMISSIONS.ANALYTICS_VIEW,
  ],
};
