import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { centerLocalToUtc } from "@/modules/booking/availability";
import { cancel, reschedule } from "@/modules/booking/bookings";
import { expireGiftCards, markStaleNoShows, sendInvoiceReminders } from "@/modules/automation/jobs";
import { DEFAULT_AUTOMATION_SETTINGS } from "@/modules/cms/settings";
import { addMonths, nextPeriodEnd } from "@/modules/memberships/memberships";
import { purchaseGiftCard, onlineGiftSalesAvailable } from "@/modules/commerce/giftShop";
import { createDraft, issueInvoice } from "@/modules/billing/invoices";
import { setupBilling, teardownBilling, makeClient as makeBillingClient, walkInDraft } from "../billing/fixtures";

// Safety/behaviour fixes from the October audit: free gift cards in
// production, booking state guards, membership renewal drift, and the new
// daily jobs (gift-card expiry, auto no-show, unpaid invoice reminders).
// Booking dates are in 2036 so the global scans only see this suite's rows.

const TAG = "TESTSAFE";
const PHONE = "+9665TESTSAFE";
let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`;
const HOUR = 3_600_000;

let serviceId = "";
let staffId = "";
let roomId = "";

async function makeClient() {
  const user = await prisma.user.create({
    data: { type: "CLIENT", phone: `${PHONE}${uid()}`, clientProfile: { create: { fullName: `${TAG} Client` } } },
    include: { clientProfile: true },
  });
  return user.clientProfile!.id;
}

async function booking(startAt: Date, status: "CONFIRMED" | "CHECKED_IN" | "NO_SHOW" | "CANCELLED" = "CONFIRMED") {
  return prisma.booking.create({
    data: {
      clientProfileId: await makeClient(),
      status,
      appointments: { create: { serviceId, staffUserId: staffId, roomId, startAt, endAt: new Date(startAt.getTime() + HOUR) } },
    },
  });
}

beforeAll(async () => {
  await setupBilling();
  const slug = `testsafe-${uid()}`;
  const dept = await prisma.department.create({ data: { slug, nameEn: "T", nameAr: "ت", taglineEn: "", taglineAr: "", descEn: "", descAr: "" } });
  serviceId = (
    await prisma.service.create({
      data: { slug, departmentId: dept.id, nameEn: "Safety Facial", nameAr: "جلسة", summaryEn: "", summaryAr: "", benefitsEn: [], benefitsAr: [], priceMinor: 10_000 },
    })
  ).id;
  staffId = (await prisma.user.create({ data: { type: "STAFF", email: `${TAG.toLowerCase()}-${uid()}@test.local` } })).id;
  roomId = (await prisma.room.create({ data: { name: `${TAG} room ${uid()}` } })).id;
});

afterAll(async () => {
  const clients = await prisma.clientProfile.findMany({ where: { user: { phone: { startsWith: PHONE } } }, select: { id: true } });
  const ids = clients.map((c) => c.id);
  const bookings = await prisma.booking.findMany({ where: { clientProfileId: { in: ids } }, select: { id: true } });
  await prisma.scheduledMessage.deleteMany({ where: { bookingId: { in: bookings.map((b) => b.id) } } });
  await prisma.booking.deleteMany({ where: { clientProfileId: { in: ids } } });
  await prisma.user.deleteMany({ where: { OR: [{ phone: { startsWith: PHONE } }, { email: { startsWith: TAG.toLowerCase() } }] } });
  await prisma.room.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.service.deleteMany({ where: { slug: { startsWith: "testsafe-" } } });
  await prisma.department.deleteMany({ where: { slug: { startsWith: "testsafe-" } } });
  await prisma.giftCard.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.giftCardOrder.deleteMany({ where: { purchaserEmail: { startsWith: TAG.toLowerCase() } } });
  await teardownBilling();
});

describe("gift cards", () => {
  it("never issues a card in production without a real payment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(onlineGiftSalesAvailable()).toBe(false);
      const r = await purchaseGiftCard({ amountMinor: 50_000, purchaserName: "Buyer", purchaserEmail: `${TAG.toLowerCase()}-${uid()}@example.com` });
      expect(r).toMatchObject({ ok: false, error: "unavailable" });
      const order = await prisma.giftCardOrder.findFirstOrThrow({ where: { purchaserEmail: { startsWith: TAG.toLowerCase() } }, orderBy: { createdAt: "desc" } });
      expect(order.status).toBe("FAILED");
      expect(order.giftCardId).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("expires active cards past their expiry date and leaves the rest", async () => {
    const now = new Date();
    const old = await prisma.giftCard.create({ data: { code: `${TAG}-${uid()}`, initialMinor: 1_000, balanceMinor: 1_000, expiresAt: new Date(now.getTime() - HOUR) } });
    const fresh = await prisma.giftCard.create({ data: { code: `${TAG}-${uid()}`, initialMinor: 1_000, balanceMinor: 1_000, expiresAt: new Date(now.getTime() + 30 * 24 * HOUR) } });
    expect(await expireGiftCards(now)).toBeGreaterThanOrEqual(1);
    expect((await prisma.giftCard.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("EXPIRED");
    expect((await prisma.giftCard.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe("ACTIVE");
  });
});

describe("booking guards", () => {
  it("cancelling twice is a no-op and a no-show can't be cancelled", async () => {
    const b = await booking(new Date(Date.now() + 400 * 24 * HOUR));
    expect((await cancel(b.id)).status).toBe("CANCELLED");
    expect((await cancel(b.id)).status).toBe("CANCELLED");
    const ns = await booking(new Date(Date.now() - 48 * HOUR), "NO_SHOW");
    await expect(cancel(ns.id)).rejects.toThrow();
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: ns.id } })).status).toBe("NO_SHOW");
  });

  it("a checked-in visit can't be rescheduled", async () => {
    const b = await booking(new Date(Date.now() + HOUR), "CHECKED_IN");
    await expect(reschedule(b.id, new Date(Date.now() + 400 * 24 * HOUR))).rejects.toThrow();
  });
});

describe("membership renewals", () => {
  it("anchor to the enrolment day instead of drifting after a short month", () => {
    const anchor = new Date("2026-01-31T09:00:00Z");
    // Jan 31 → Feb 28 → Mar 31 (not Mar 28).
    const feb = nextPeriodEnd(anchor, anchor);
    expect(feb.toISOString().slice(0, 10)).toBe(addMonths(anchor, 1).toISOString().slice(0, 10));
    const mar = nextPeriodEnd(anchor, feb);
    expect(mar.getTime()).toBe(addMonths(anchor, 2).getTime());
    expect(mar.getUTCDate()).toBeGreaterThan(feb.getUTCDate());
  });
});

describe("auto no-show", () => {
  it("marks confirmed visits that ended long ago with no check-in, nothing else", async () => {
    const now = centerLocalToUtc("2036-03-10", 2 * 60 + 5);
    const stale = await booking(new Date(now.getTime() - 30 * HOUR));
    const recent = await booking(new Date(now.getTime() - 3 * HOUR));
    const ancient = await booking(new Date(now.getTime() - 20 * 24 * HOUR));
    const settings = { ...DEFAULT_AUTOMATION_SETTINGS, autoNoShowEnabled: true, autoNoShowHours: 24 };
    expect(await markStaleNoShows({ now, settings })).toBeGreaterThanOrEqual(1);
    const status = async (id: string) => (await prisma.booking.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(stale.id)).toBe("NO_SHOW");
    expect(await status(recent.id)).toBe("CONFIRMED");
    expect(await status(ancient.id)).toBe("CONFIRMED");
  });
});

describe("unpaid invoice reminders", () => {
  it("reminds after N days, again after 2N, and never more than twice", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const client = await makeBillingClient();
    const inv = await issueInvoice((await createDraft({ ...walkInDraft(5_000), clientProfileId: client.profileId, customerPhone: client.phone })).id);
    const issuedAt = inv.issuedAt!.getTime();
    const settings = { ...DEFAULT_AUTOMATION_SETTINGS, invoiceReminderEnabled: true, invoiceReminderDays: 3 };
    const sent = async () => (await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).remindersSent;

    await sendInvoiceReminders({ now: new Date(issuedAt + 2 * 24 * HOUR), settings });
    expect(await sent()).toBe(0);
    await sendInvoiceReminders({ now: new Date(issuedAt + 3 * 24 * HOUR + 1_000), settings });
    expect(await sent()).toBe(1);
    // Same day again: nothing new.
    await sendInvoiceReminders({ now: new Date(issuedAt + 3 * 24 * HOUR + 2_000), settings });
    expect(await sent()).toBe(1);
    await sendInvoiceReminders({ now: new Date(issuedAt + 6 * 24 * HOUR + 1_000), settings });
    expect(await sent()).toBe(2);
    await sendInvoiceReminders({ now: new Date(issuedAt + 30 * 24 * HOUR), settings });
    expect(await sent()).toBe(2);
    expect(await prisma.communicationLog.count({ where: { kind: "INVOICE", toPhone: client.phone } })).toBe(2);
    info.mockRestore();
  });
});

describe("backup health", () => {
  it("flags missing, stale, failed and local-only backups", async () => {
    const { backupProblem } = await import("@/modules/automation/jobs");
    const now = new Date("2026-10-15T08:00:00Z");
    expect(backupProblem(undefined, now)).toMatch(/No backup/);
    expect(backupProblem({ startedAt: new Date("2026-10-13T19:00:00Z"), ok: true, summary: "ok" }, now)).toMatch(/day and a half/);
    expect(backupProblem({ startedAt: new Date("2026-10-14T23:15:00Z"), ok: false, summary: "2 file(s), 40M, LOCAL ONLY" }, now)).toMatch(/LOCAL ONLY/);
    expect(backupProblem({ startedAt: new Date("2026-10-14T23:15:00Z"), ok: true, summary: "copied off-site" }, now)).toBeNull();
  });
});
