// Client-safe search vocabulary (no DB imports): group keys, labels, the
// permission that unlocks each group, and the result shape. globalSearch.ts
// re-exports these for server callers; client components import from here.

import { PERMISSIONS, type PermissionKey } from "@/modules/iam/permissions";

export interface SearchHit {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  badge?: string;
}

export const SEARCH_GROUPS = [
  "customers",
  "bookings",
  "invoices",
  "products",
  "employees",
  "inquiries",
  "conversations",
  "chats",
  "callbacks",
] as const;
export type SearchGroupKey = (typeof SEARCH_GROUPS)[number];

export const SEARCH_GROUP_LABELS: Record<SearchGroupKey, string> = {
  customers: "Customers",
  bookings: "Bookings",
  invoices: "Invoices",
  products: "Products",
  employees: "Employees",
  inquiries: "Inquiries",
  conversations: "WhatsApp",
  chats: "Chat sessions",
  callbacks: "Call-backs",
};

// Which permission unlocks each group. Mirrors the sidebar gates.
export const SEARCH_GROUP_PERMISSION: Record<SearchGroupKey, PermissionKey> = {
  customers: PERMISSIONS.CLIENT_VIEW,
  bookings: PERMISSIONS.BOOKING_VIEW,
  invoices: PERMISSIONS.BILLING_MANAGE,
  products: PERMISSIONS.INVENTORY_MANAGE,
  employees: PERMISSIONS.HR_MANAGE,
  inquiries: PERMISSIONS.CMS_MANAGE,
  conversations: PERMISSIONS.CLIENT_MANAGE,
  chats: PERMISSIONS.CLIENT_VIEW,
  callbacks: PERMISSIONS.CLIENT_VIEW,
};

export type GlobalSearchResult = Record<SearchGroupKey, SearchHit[]>;

export function emptySearchResult(): GlobalSearchResult {
  return Object.fromEntries(SEARCH_GROUPS.map((g) => [g, [] as SearchHit[]])) as unknown as GlobalSearchResult;
}

export function searchTotal(result: GlobalSearchResult): number {
  return SEARCH_GROUPS.reduce((sum, g) => sum + result[g].length, 0);
}
