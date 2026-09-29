import { describe, it, expect } from "vitest";
import { deriveBreadcrumbs } from "@/app/admin/_components/deriveBreadcrumbs";
import { PERMISSIONS } from "@/modules/iam/permissions";

const full = new Set([PERMISSIONS.BILLING_MANAGE, PERMISSIONS.CLIENT_VIEW, PERMISSIONS.INVENTORY_MANAGE]);

describe("deriveBreadcrumbs", () => {
  it("returns only the leaf on the dashboard", () => {
    expect(deriveBreadcrumbs("/admin", "Today", full)).toEqual([{ label: "Today" }]);
  });

  it("links the parent menu item and uses the page title as the leaf for record pages", () => {
    const crumbs = deriveBreadcrumbs("/admin/billing/ckx123456789012345678901", "INV-2026-000123", full);
    expect(crumbs).toEqual([
      { label: "Dashboard", href: "/admin" },
      { label: "Invoices & payments", href: "/admin/billing" },
      { label: "INV-2026-000123" },
    ]);
  });

  it("labels non-menu segments and skips ids in the middle of a path", () => {
    const crumbs = deriveBreadcrumbs("/admin/clients/ckx123456789012345678901/clinical/treatment", "Treatment records", full);
    expect(crumbs.map((c) => c.label)).toEqual(["Dashboard", "Customers", "Patient file", "Treatment records"]);
    expect(crumbs[1]).toEqual({ label: "Customers", href: "/admin/clients" });
  });

  it("drops the link (keeps the label) when the viewer cannot see that menu item", () => {
    const crumbs = deriveBreadcrumbs("/admin/inventory/products/new", "New product", new Set([PERMISSIONS.CLIENT_VIEW]));
    expect(crumbs[1]).toEqual({ label: "Products & stock" });
    expect(crumbs[2]).toEqual({ label: "Products", href: "/admin/inventory/products" });
  });

  it("respects the superadmin hidden-menu list", () => {
    const crumbs = deriveBreadcrumbs("/admin/billing/new", "New invoice", full, ["/admin/billing"]);
    expect(crumbs[1]).toEqual({ label: "Invoices & payments" });
  });

  it("collapses an intermediate crumb that repeats the leaf title", () => {
    const crumbs = deriveBreadcrumbs("/admin/clients/ckx123456789012345678901", "Customers", full);
    expect(crumbs.map((c) => c.label)).toEqual(["Dashboard", "Customers"]);
  });
});
