import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { leaveSource } from "@/modules/notifications/sources/leave";
import { documentSource } from "@/modules/notifications/sources/documents";
import { saveEmployeeRecord } from "@/modules/hr/employees";
import { requestLeave } from "@/modules/hr/leave";
import { addDays, todayISO } from "@/modules/hr/dates";
import type { PermissionKey } from "@/modules/iam/permissions";
import { cleanupHrTestData, createStaff } from "./helpers";

const HR = new Set<PermissionKey>(["hr:manage"]);
const NONE = new Set<PermissionKey>();

describe("HR notification sources", () => {
  let userId: string;
  beforeAll(async () => {
    await cleanupHrTestData();
    userId = await createStaff("notify");
    await saveEmployeeRecord(userId, { passportExpiry: addDays(todayISO(), 20), contractEnd: addDays(todayISO(), 400) });
    await requestLeave(userId, { type: "SICK", startDateISO: "2032-01-05", endDateISO: "2032-01-06" });
  });
  afterAll(async () => {
    await cleanupHrTestData();
  });

  it("hides everything without hr:manage", async () => {
    expect(await leaveSource(NONE)).toEqual({ count: 0, items: [] });
    expect(await documentSource(NONE)).toEqual({ count: 0, items: [] });
  });

  it("surfaces pending leave requests", async () => {
    const res = await leaveSource(HR);
    expect(res.count).toBeGreaterThanOrEqual(1);
    expect(res.items.some((i) => i.type === "leave" && i.title.includes("HR Test notify"))).toBe(true);
  });

  it("flags a passport expiring within 60 days but not a contract a year out", async () => {
    const res = await documentSource(HR);
    const mine = res.items.filter((i) => i.href === `/admin/hr/${userId}`);
    expect(mine.map((i) => i.title)).toEqual(["Passport expiring — HR Test notify"]);
  });
});
