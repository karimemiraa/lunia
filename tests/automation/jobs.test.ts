import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { centerLocalToUtc } from "@/modules/booking/availability";
import { runDueJobs, schedulePackageReminders, findLapsedCustomers, scheduleWinBacks, type JobDef } from "@/modules/automation/jobs";
import { DEFAULT_AUTOMATION_SETTINGS } from "@/modules/cms/settings";
import { createPackage, purchasePackage, consumePackageSession, expirePackagePurchases, listActivePackagePurchasesForClient, updatePackage } from "@/modules/commerce/packages";
import { renderMessageBody } from "@/modules/booking/outbox";

// Scheduled automations and package validity. Dates are in 2035 so the
// global scans (lapsed customers, expiring packages) only see this suite's rows.

const TAG = "TESTAUTO";
const PHONE = "+9665TESTAUTO";
let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`;
const DAY = 86_400_000;

async function makeClient(name = `${TAG} Client`, opts: { marketingOptIn?: boolean } = {}) {
  const user = await prisma.user.create({
    data: {
      type: "CLIENT",
      phone: `${PHONE}${uid()}`,
      locale: "en",
      clientProfile: {
        create: { fullName: name, ...(opts.marketingOptIn === false ? { notificationPreference: { create: { marketingOptIn: false } } } : {}) },
      },
    },
    include: { clientProfile: true },
  });
  return user.clientProfile!;
}

let serviceId = "";
let staffId = "";
let roomId = "";

async function visit(clientProfileId: string, startAt: Date, status: "COMPLETED" | "CONFIRMED") {
  return prisma.booking.create({
    data: {
      clientProfileId,
      status,
      appointments: { create: { serviceId, staffUserId: staffId, roomId, startAt, endAt: new Date(startAt.getTime() + 3_600_000) } },
    },
  });
}

beforeAll(async () => {
  const slug = `testauto-${uid()}`;
  const dept = await prisma.department.create({ data: { slug, nameEn: "T", nameAr: "ت", taglineEn: "", taglineAr: "", descEn: "", descAr: "" } });
  serviceId = (
    await prisma.service.create({
      data: { slug, departmentId: dept.id, nameEn: "Radiance Facial", nameAr: "جلسة نضارة", summaryEn: "", summaryAr: "", benefitsEn: [], benefitsAr: [], priceMinor: 50_000 },
    })
  ).id;
  staffId = (await prisma.user.create({ data: { type: "STAFF", email: `${TAG.toLowerCase()}-${uid()}@test.local` } })).id;
  roomId = (await prisma.room.create({ data: { name: `${TAG} room ${uid()}` } })).id;
});

afterAll(async () => {
  const clients = await prisma.clientProfile.findMany({ where: { user: { phone: { startsWith: PHONE } } }, select: { id: true } });
  const ids = clients.map((c) => c.id);
  await prisma.scheduledMessage.deleteMany({ where: { clientProfileId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { clientProfileId: { in: ids } } });
  await prisma.packagePurchase.deleteMany({ where: { clientProfileId: { in: ids } } });
  await prisma.servicePackage.deleteMany({ where: { nameEn: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { OR: [{ phone: { startsWith: PHONE } }, { email: { startsWith: TAG.toLowerCase() } }] } });
  await prisma.room.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.service.deleteMany({ where: { slug: { startsWith: "testauto-" } } });
  await prisma.department.deleteMany({ where: { slug: { startsWith: "testauto-" } } });
  await prisma.jobRun.deleteMany({ where: { job: { startsWith: "test-" } } });
});

describe("job runner", () => {
  it("runs a job once per Riyadh day, only after its hour, and records the result", async () => {
    let calls = 0;
    const job: JobDef = { name: `test-${uid()}`, hour: 9, label: "t", enabled: () => true, run: async () => `call ${++calls}` };
    const early = centerLocalToUtc("2035-01-10", 8 * 60 + 59);
    expect(await runDueJobs(early, [job])).toEqual([]);

    const morning = centerLocalToUtc("2035-01-10", 9 * 60 + 5);
    expect(await runDueJobs(morning, [job])).toEqual([{ job: job.name, status: "ran", summary: "call 1" }]);
    // Same day again (another tick or replica): skipped.
    expect(await runDueJobs(new Date(morning.getTime() + 3_600_000), [job])).toEqual([]);
    // Next day: runs again.
    expect(await runDueJobs(centerLocalToUtc("2035-01-11", 10 * 60), [job])).toHaveLength(1);
    expect(calls).toBe(2);

    const runs = await prisma.jobRun.findMany({ where: { job: job.name }, orderBy: { runKey: "asc" } });
    expect(runs.map((r) => [r.runKey, r.ok, r.summary])).toEqual([
      ["2035-01-10", true, "call 1"],
      ["2035-01-11", true, "call 2"],
    ]);
  });

  it("records failures and skips disabled jobs", async () => {
    const failing: JobDef = { name: `test-${uid()}`, hour: 0, label: "t", enabled: () => true, run: async () => Promise.reject(new Error("boom")) };
    const disabled: JobDef = { name: `test-${uid()}`, hour: 0, label: "t", enabled: () => false, run: async () => "nope" };
    const out = await runDueJobs(centerLocalToUtc("2035-01-12", 600), [failing, disabled]);
    expect(out).toEqual([{ job: failing.name, status: "failed", summary: "boom" }]);
    expect(await prisma.jobRun.count({ where: { job: disabled.name } })).toBe(0);
  });
});

describe("package validity", () => {
  it("sets expiry from the package, blocks redemption after it, and expires it", async () => {
    const client = await makeClient();
    const pkg = await createPackage({ nameEn: `${TAG} 6x Facial`, nameAr: "باقة", sessionsTotal: 6, priceMinor: 300_000, validityDays: 30 });
    const bought = new Date("2035-03-01T09:00:00Z");
    const purchase = await purchasePackage(client.id, pkg.id, bought);
    expect(purchase.expiresAt?.toISOString()).toBe("2035-03-31T09:00:00.000Z");

    // Usable before expiry…
    await expect(consumePackageSession(purchase.id, undefined, new Date("2035-03-10T09:00:00Z"))).resolves.toMatchObject({ sessionsRemaining: 5 });
    // …refused after.
    await expect(consumePackageSession(purchase.id, undefined, new Date("2035-04-01T09:00:00Z"))).rejects.toThrow(/expired/);

    expect(await expirePackagePurchases(new Date("2035-04-01T00:00:00Z"))).toBeGreaterThanOrEqual(1);
    expect((await prisma.packagePurchase.findUniqueOrThrow({ where: { id: purchase.id } })).status).toBe("EXPIRED");
    expect(await listActivePackagePurchasesForClient(client.id)).toEqual([]);
  });

  it("edits apply to new sales only; retiring stops new sales", async () => {
    const client = await makeClient();
    const pkg = await createPackage({ nameEn: `${TAG} Peel x3`, nameAr: "باقة", sessionsTotal: 3, priceMinor: 90_000 });
    const before = await purchasePackage(client.id, pkg.id);
    expect(before.expiresAt).toBeNull();

    await updatePackage(pkg.id, { sessionsTotal: 4, validityDays: 60 });
    const after = await purchasePackage(client.id, pkg.id);
    expect(after.sessionsRemaining).toBe(4);
    expect(after.expiresAt).not.toBeNull();
    expect((await prisma.packagePurchase.findUniqueOrThrow({ where: { id: before.id } })).sessionsRemaining).toBe(3);

    await updatePackage(pkg.id, { isActive: false });
    await expect(purchasePackage(client.id, pkg.id)).rejects.toThrow(/no longer available/);
  });
});

describe("package expiry reminders", () => {
  it("schedules one reminder per purchase, with the package details", async () => {
    const client = await makeClient(`${TAG} Noura Reminder`);
    const pkg = await createPackage({ nameEn: `${TAG} Hydra x6`, nameAr: "باقة هيدرا", sessionsTotal: 6, priceMinor: 300_000, validityDays: 40 });
    const purchase = await purchasePackage(client.id, pkg.id, new Date("2035-05-01T09:00:00Z")); // expires Jun 10
    const now = new Date("2035-05-30T07:00:00Z"); // 11 days before

    const ctx = { now, settings: { ...DEFAULT_AUTOMATION_SETTINGS, packageReminderDays: 14 } };
    expect(await schedulePackageReminders(ctx)).toBe(1);
    expect(await schedulePackageReminders(ctx)).toBe(0); // only once

    const msg = await prisma.scheduledMessage.findFirstOrThrow({ where: { clientProfileId: client.id, kind: "PACKAGE_EXPIRING" } });
    const payload = msg.payload as Record<string, string | number>;
    expect(payload).toMatchObject({ name: "TESTAUTO", packageName: `${TAG} Hydra x6`, sessionsLeft: 6 });
    expect(String(payload.link)).toMatch(/\/en\/book$/);
    const body = renderMessageBody("PACKAGE_EXPIRING", "en", payload);
    expect(body).toContain(`${TAG} Hydra x6`);
    expect(body).toContain("6 session(s) left");
    expect((await prisma.packagePurchase.findUniqueOrThrow({ where: { id: purchase.id } })).expiryReminderAt).not.toBeNull();
  });
});

describe("win-back", () => {
  const NOW = new Date("2035-09-01T08:00:00Z");
  const settings = { ...DEFAULT_AUTOMATION_SETTINGS, winBackEnabled: true, winBackDays: 90, winBackDailyCap: 40 };
  const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY);

  it("targets lapsed customers only: nothing booked, allows offers, not messaged recently", async () => {
    const lapsed = await makeClient(`${TAG} Lapsed`);
    await visit(lapsed.id, daysAgo(200), "COMPLETED");
    await visit(lapsed.id, daysAgo(95), "COMPLETED"); // last visit: 95 days ago

    const recent = await makeClient(`${TAG} Recent`);
    await visit(recent.id, daysAgo(95), "COMPLETED");
    await visit(recent.id, daysAgo(20), "COMPLETED"); // came back since

    const booked = await makeClient(`${TAG} Booked`);
    await visit(booked.id, daysAgo(96), "COMPLETED");
    await visit(booked.id, new Date(NOW.getTime() + 5 * DAY), "CONFIRMED"); // already rebooked

    const optedOut = await makeClient(`${TAG} OptedOut`, { marketingOptIn: false });
    await visit(optedOut.id, daysAgo(97), "COMPLETED");

    const found = (await findLapsedCustomers(NOW, settings)).map((l) => l.profile.id);
    expect(found).toContain(lapsed.id);
    expect(found).not.toContain(recent.id);
    expect(found).not.toContain(booked.id);
    expect(found).not.toContain(optedOut.id);

    expect(await scheduleWinBacks({ now: NOW, settings })).toBeGreaterThanOrEqual(1);
    const msg = await prisma.scheduledMessage.findFirstOrThrow({ where: { clientProfileId: lapsed.id, kind: "WIN_BACK" } });
    expect(msg.payload).toMatchObject({ lastService: "Radiance Facial" });

    // Cooldown: not picked again the next day.
    const tomorrow = new Date(NOW.getTime() + DAY);
    expect((await findLapsedCustomers(tomorrow, settings)).map((l) => l.profile.id)).not.toContain(lapsed.id);
  });

  it("respects the daily cap", async () => {
    const capNow = new Date("2035-11-01T08:00:00Z");
    for (let i = 0; i < 3; i++) {
      const c = await makeClient(`${TAG} Cap ${i}`);
      await visit(c.id, new Date(capNow.getTime() - (92 + i) * DAY), "COMPLETED");
    }
    expect(await scheduleWinBacks({ now: capNow, settings: { ...settings, winBackDailyCap: 2 } })).toBe(2);
  });
});
