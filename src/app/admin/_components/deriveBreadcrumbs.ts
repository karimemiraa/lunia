// Breadcrumb derivation from the route + the nav catalog. Pure, so it can be
// unit-tested without a router. The leaf is the page's own title (AdminShell
// passes it), which is how record pages show "Sara Al-Rashid" instead of an id.

import { NAV_GROUPS, visibleNavItems } from "./navCatalog";
import type { PermissionKey } from "@/modules/iam/permissions";

export interface Crumb {
  label: string;
  href?: string;
}

// Route segments that aren't menu items but deserve a readable label.
const SEGMENT_LABELS: Record<string, string> = {
  new: "New",
  edit: "Edit",
  products: "Products",
  settings: "Settings",
  cash: "Cash drawer",
  expenses: "Expenses",
  consents: "Consent forms",
  clinical: "Patient file",
  photo: "Photos",
  consent: "Consent",
  "stock-take": "Stock take",
  "purchase-orders": "Purchase orders",
  suppliers: "Suppliers",
  attendance: "Attendance",
  leave: "Leave requests",
  payroll: "Payroll",
  broadcast: "Broadcast",
  rooms: "Rooms",
  schedules: "Schedules",
  print: "Print",
  xml: "XML",
  "view-as": "Customer view",
  search: "Search",
  notifications: "Notifications",
};

const ID_LIKE = /^(c[a-z0-9]{20,}|[0-9a-f-]{20,}|\d+)$/i;

function humanize(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  return segment.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Builds crumbs for `pathname`:
 *   /admin/billing/abc123  -> Dashboard / Invoices & payments / <leafTitle>
 *   /admin/inventory/products/new -> Dashboard / Products & stock / Products / <leafTitle>
 * Menu items the viewer can't see (permission or hidden) become plain text
 * (no link) rather than disappearing, so the path still reads correctly.
 */
export function deriveBreadcrumbs(
  pathname: string,
  leafTitle: string,
  permissions: Set<PermissionKey>,
  hiddenHrefs: string[] = [],
): Crumb[] {
  const clean = pathname.split("?")[0]!.replace(/\/+$/, "");
  if (!clean.startsWith("/admin")) return [{ label: leafTitle }];

  const labelByHref = new Map<string, string>();
  for (const g of NAV_GROUPS) for (const item of g.items) labelByHref.set(item.href, item.label);
  const visible = new Set(visibleNavItems(permissions, hiddenHrefs).map((i) => i.href));

  const crumbs: Crumb[] = [{ label: "Dashboard", href: "/admin" }];
  if (clean === "/admin") return [{ label: leafTitle }];

  const segments = clean.slice("/admin".length).split("/").filter(Boolean);
  let href = "/admin";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    href += `/${seg}`;
    const isLeaf = i === segments.length - 1;
    if (isLeaf) {
      crumbs.push({ label: leafTitle });
      break;
    }
    // Record ids in the middle of a path (e.g. /clients/:id/clinical) can't
    // be named without a fetch; skip them so the trail stays readable.
    if (ID_LIKE.test(seg) && !labelByHref.has(href)) continue;
    const label = labelByHref.get(href) ?? humanize(seg);
    const linkable = labelByHref.has(href) ? visible.has(href) : true;
    crumbs.push(linkable ? { label, href } : { label });
  }
  // Drop an intermediate crumb that merely repeats the leaf title
  // ("Customers / Customers" on an unnamed record).
  if (crumbs.length >= 3 && crumbs[crumbs.length - 2]!.label === leafTitle) crumbs.splice(crumbs.length - 2, 1);
  return crumbs;
}
