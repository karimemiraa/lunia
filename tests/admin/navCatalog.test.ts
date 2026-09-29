import { describe, it, expect } from "vitest";
import { visibleNavItems, paletteActionsFor, NAV_CATALOG, NAV_GROUPS } from "@/app/admin/_components/navCatalog";
import { PERMISSIONS } from "@/modules/iam/permissions";

describe("visibleNavItems", () => {
  it("filters by permission and by the hidden-menu setting", () => {
    const items = visibleNavItems(new Set([PERMISSIONS.BOOKING_VIEW, PERMISSIONS.CLIENT_VIEW]), ["/admin/waitlist"]);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/admin");
    expect(hrefs).toContain("/admin/calendar");
    expect(hrefs).toContain("/admin/clients");
    expect(hrefs).not.toContain("/admin/waitlist");
    expect(hrefs).not.toContain("/admin/billing");
    expect(hrefs).not.toContain("/superadmin");
  });

  it("ignores hidden hrefs for the superadmin", () => {
    const items = visibleNavItems(new Set([PERMISSIONS.PLATFORM_MANAGE, PERMISSIONS.BOOKING_VIEW]), ["/admin/calendar"]);
    expect(items.map((i) => i.href)).toContain("/admin/calendar");
  });

  it("keeps the plain catalog in sync with the groups (superadmin editor)", () => {
    expect(NAV_CATALOG.flatMap((g) => g.items.map((i) => i.href))).toEqual(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)));
  });
});

describe("paletteActionsFor", () => {
  it("only offers actions the viewer may perform and whose page is visible", () => {
    const perms = new Set([PERMISSIONS.BOOKING_MANAGE, PERMISSIONS.BILLING_MANAGE]);
    const ids = paletteActionsFor(perms, new Set(["/admin/calendar", "/admin/me"])).map((a) => a.id);
    expect(ids).toEqual(["new-booking", "clock", "website"]);
  });

  it("always offers the website link", () => {
    expect(paletteActionsFor(new Set(), new Set()).map((a) => a.id)).toEqual(["website"]);
  });
});
