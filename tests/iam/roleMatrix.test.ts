import { describe, expect, it } from "vitest";
import { PERMISSIONS as P, ROLE_PERMISSIONS, ungrantableChanges } from "@/modules/iam/permissions";

// docs/PRD-commission-discounts-roles.md §3.3 — what each job may do.
const has = (role: string, key: string) => ROLE_PERMISSIONS[role]!.includes(key as never);

describe("role matrix", () => {
  it("specialist: own visits, patient file, notes, capped discounts — no money or customer admin", () => {
    for (const k of [P.BOOKING_VIEW, P.CLIENT_VIEW, P.VISITNOTE_WRITE, P.CLINICAL_MANAGE, P.DISCOUNT_GIVE]) expect(has("specialist", k)).toBe(true);
    for (const k of [P.BILLING_MANAGE, P.BOOKING_MANAGE, P.CLIENT_MANAGE, P.DISCOUNT_APPROVE, P.ANALYTICS_VIEW, P.HR_MANAGE]) expect(has("specialist", k)).toBe(false);
  });

  it("manager owns prices and approves discounts, but not HR, settings or the website", () => {
    for (const k of [P.CATALOG_MANAGE, P.DISCOUNT_APPROVE, P.VISITNOTE_WRITE, P.BILLING_MANAGE]) expect(has("manager", k)).toBe(true);
    for (const k of [P.HR_MANAGE, P.SETTINGS_MANAGE, P.CMS_MANAGE]) expect(has("manager", k)).toBe(false);
  });

  it("marketing no longer edits services or prices", () => {
    expect(has("marketing", P.CATALOG_MANAGE)).toBe(false);
    expect(has("marketing", P.CMS_MANAGE)).toBe(true);
  });

  it("front-desk roles write notes; reception has no medical file", () => {
    for (const r of ["reception", "sales", "telesales"]) expect(has(r, P.VISITNOTE_WRITE)).toBe(true);
    expect(has("reception", P.CLINICAL_MANAGE)).toBe(false);
  });

  it("only owner/admin see team pay (HR)", () => {
    const withHr = Object.keys(ROLE_PERMISSIONS).filter((r) => has(r, P.HR_MANAGE)).sort();
    expect(withHr).toEqual(["admin", "owner"]);
  });
});

describe("ungrantableChanges (no privilege escalation)", () => {
  const manager = ROLE_PERMISSIONS.manager!;
  it("allows adding or removing permissions the editor holds", () => {
    expect(ungrantableChanges(manager, [P.BOOKING_VIEW], [P.BOOKING_VIEW, P.BILLING_MANAGE])).toEqual([]);
    expect(ungrantableChanges(manager, [P.BOOKING_VIEW, P.BILLING_MANAGE], [P.BOOKING_VIEW])).toEqual([]);
  });
  it("blocks adding a permission the editor lacks", () => {
    expect(ungrantableChanges(manager, [P.BOOKING_VIEW], [P.BOOKING_VIEW, P.SETTINGS_MANAGE])).toEqual([P.SETTINGS_MANAGE]);
  });
  it("blocks removing a permission the editor lacks (e.g. stripping HR from the owner)", () => {
    expect(ungrantableChanges(manager, [P.HR_MANAGE, P.BOOKING_VIEW], [P.BOOKING_VIEW])).toEqual([P.HR_MANAGE]);
  });
  it("unchanged keys the editor lacks are fine", () => {
    expect(ungrantableChanges(manager, [P.HR_MANAGE], [P.HR_MANAGE, P.BOOKING_VIEW])).toEqual([]);
  });
});
