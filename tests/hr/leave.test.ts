import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { leaveEntitlement, documentFlags, saveEmployeeRecord } from "@/modules/hr/employees";
import { requestLeave, decideLeave, cancelOwnLeave, getLeaveBalance, approvedLeaveDaysInMonth } from "@/modules/hr/leave";
import { isoToDate } from "@/modules/hr/dates";
import { cleanupHrTestData, createStaff } from "./helpers";

describe("leaveEntitlement", () => {
  it("grants 21 days before five years of service", () => {
    const e = leaveEntitlement("2022-03-01", "2026-09-27");
    expect(e.yearsOfService).toBe(4);
    expect(e.statutoryDays).toBe(21);
    expect(e.annualDays).toBe(21);
    expect(e.serviceYearStartISO).toBe("2026-03-01");
    expect(e.serviceYearEndISO).toBe("2027-03-01");
  });

  it("grants 30 days once five full years are completed", () => {
    expect(leaveEntitlement("2021-09-27", "2026-09-26").annualDays).toBe(21);
    const e = leaveEntitlement("2021-09-27", "2026-09-27");
    expect(e.yearsOfService).toBe(5);
    expect(e.annualDays).toBe(30);
  });

  it("pro-rates accrual across the service year", () => {
    // 2025-01-01 -> 2025-07-02 inclusive = 183 of 365 days.
    expect(leaveEntitlement("2025-01-01", "2025-07-02").accruedDays).toBeCloseTo((21 * 183) / 365, 1);
    // First day of a service year accrues one day's worth.
    expect(leaveEntitlement("2025-01-01", "2025-01-01").accruedDays).toBe(0.1);
    // Last day of the service year: the full entitlement.
    expect(leaveEntitlement("2025-01-01", "2025-12-31").accruedDays).toBe(21);
  });

  it("honours a better contractual entitlement but never less than the statute", () => {
    expect(leaveEntitlement("2025-01-01", "2025-06-01", 25).annualDays).toBe(25);
    expect(leaveEntitlement("2019-01-01", "2025-06-01", 25).annualDays).toBe(30);
  });

  it("accrues nothing before the hire date and uses the calendar year without one", () => {
    expect(leaveEntitlement("2027-01-01", "2026-09-27").accruedDays).toBe(0);
    const e = leaveEntitlement(null, "2026-09-27");
    expect(e.serviceYearStartISO).toBe("2026-01-01");
    expect(e.annualDays).toBe(21);
  });
});

describe("documentFlags", () => {
  it("flags expired and soon-expiring documents only", () => {
    const flags = documentFlags(
      {
        isSaudi: false,
        nationalIdExpiry: isoToDate("2026-10-20"),
        passportExpiry: isoToDate("2026-09-01"),
        contractEnd: isoToDate("2027-06-01"),
      },
      "2026-09-27",
    );
    expect(flags.map((f) => [f.label, f.status])).toEqual([
      ["Iqama", "expiring"],
      ["Passport", "expired"],
    ]);
  });
});

describe("leave requests", () => {
  let userId: string;
  let managerId: string;

  beforeAll(async () => {
    await cleanupHrTestData();
    userId = await createStaff("leave");
    managerId = await createStaff("manager");
    const res = await saveEmployeeRecord(userId, { hireDate: "2020-01-01", annualLeaveDays: "21" });
    expect(res.ok).toBe(true);
  });

  afterAll(async () => {
    await cleanupHrTestData();
  });

  it("rejects a request overlapping a pending or approved one", async () => {
    const first = await requestLeave(userId, { type: "ANNUAL", startDateISO: "2031-03-10", endDateISO: "2031-03-14" });
    expect(first.ok).toBe(true);

    const clash = await requestLeave(userId, { type: "SICK", startDateISO: "2031-03-14", endDateISO: "2031-03-16" });
    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(clash.error).toMatch(/overlaps/);

    // Adjacent days are fine.
    const next = await requestLeave(userId, { type: "SICK", startDateISO: "2031-03-15", endDateISO: "2031-03-16" });
    expect(next.ok).toBe(true);

    // Once approved it still blocks overlaps.
    if (first.ok) expect((await decideLeave(first.id, "APPROVED", managerId)).ok).toBe(true);
    const again = await requestLeave(userId, { type: "OTHER", startDateISO: "2031-03-09", endDateISO: "2031-03-10" });
    expect(again.ok).toBe(false);
  });

  it("frees the dates once a request is rejected or cancelled", async () => {
    const a = await requestLeave(userId, { type: "SICK", startDateISO: "2031-04-01", endDateISO: "2031-04-02" });
    expect(a.ok).toBe(true);
    if (a.ok) expect((await decideLeave(a.id, "REJECTED", managerId)).ok).toBe(true);
    const b = await requestLeave(userId, { type: "SICK", startDateISO: "2031-04-01", endDateISO: "2031-04-02" });
    expect(b.ok).toBe(true);
    if (b.ok) {
      expect((await cancelOwnLeave(b.id, userId)).ok).toBe(true);
      // Can't decide a cancelled request.
      expect((await decideLeave(b.id, "APPROVED", managerId)).ok).toBe(false);
    }
    expect((await requestLeave(userId, { type: "SICK", startDateISO: "2031-04-02", endDateISO: "2031-04-02" })).ok).toBe(true);
  });

  it("rejects an end date before the start date", async () => {
    const r = await requestLeave(userId, { type: "SICK", startDateISO: "2031-05-10", endDateISO: "2031-05-01" });
    expect(r.ok).toBe(false);
  });

  it("counts approved annual days against the balance (30 days after 5 years)", async () => {
    const balance = await getLeaveBalance(userId, "2031-03-20");
    expect(balance.annualDays).toBe(30); // hired 2020, 11 years of service
    expect(balance.usedDays).toBe(5);
    expect(balance.remainingYearDays).toBe(25);
    // 2031-01-01 -> 2031-03-20 = 79 days of 365
    expect(balance.balanceDays).toBeCloseTo((30 * 79) / 365 - 5, 1);
  });

  it("refuses annual leave beyond the remaining yearly entitlement", async () => {
    const r = await requestLeave(userId, { type: "ANNUAL", startDateISO: "2031-06-01", endDateISO: "2031-06-26" });
    expect(r.ok).toBe(false);
  });

  it("counts approved unpaid days inside a month, clipped at the month edges", async () => {
    const r = await requestLeave(userId, { type: "UNPAID", startDateISO: "2031-07-29", endDateISO: "2031-08-03" });
    expect(r.ok).toBe(true);
    if (r.ok) await decideLeave(r.id, "APPROVED", managerId);
    expect(await approvedLeaveDaysInMonth(userId, "2031-07", "UNPAID")).toBe(3);
    expect(await approvedLeaveDaysInMonth(userId, "2031-08", "UNPAID")).toBe(3);
  });

  it("stores the record fields from the form", async () => {
    const rec = await prisma.employeeRecord.findUniqueOrThrow({ where: { userId } });
    expect(rec.annualLeaveDays).toBe(21);
  });
});

describe("splitReason", () => {
  it("separates the requester's reason from the HR note", async () => {
    const { splitReason } = await import("@/modules/hr/leave");
    expect(splitReason("Family trip\n\nHR note: Enjoy")).toEqual({ reason: "Family trip", hrNote: "Enjoy" });
    expect(splitReason("\n\nHR note: Covered by Sara")).toEqual({ reason: null, hrNote: "Covered by Sara" });
    expect(splitReason("Just a reason")).toEqual({ reason: "Just a reason", hrNote: null });
  });
});
