import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { centerLocalToUtc } from "@/modules/booking/availability";
import { PERMISSIONS as P, type PermissionKey } from "@/modules/iam/permissions";
import { createDraftFromBooking, syncDraftDiscount } from "@/modules/billing/invoices";
import { decideDiscount, discountAmount, giveDiscount, lockDiscountsToInvoice, needsApproval, removeDiscount } from "@/modules/booking/discounts";

// Specialist discounts (docs/PRD-commission-discounts-roles.md §3.2).

describe("discount rules", () => {
  it("needs a manager above the cap or the SAR ceiling; approvers never do", () => {
    const base = { priceMinor: 500_00, capPct: 10, maxMinor: null, canApprove: false };
    expect(needsApproval({ ...base, amountMinor: 50_00 })).toBe(false);
    expect(needsApproval({ ...base, amountMinor: 50_01 })).toBe(true);
    expect(needsApproval({ ...base, amountMinor: 40_00, maxMinor: 30_00 })).toBe(true);
    expect(needsApproval({ ...base, amountMinor: 400_00, canApprove: true })).toBe(false);
  });

  it("works out the amount from % or SAR and refuses nonsense", () => {
    expect(discountAmount(500_00, { pct: 10 })).toBe(50_00);
    expect(discountAmount(500_00, { amountMinor: 75_00 })).toBe(75_00);
    expect(() => discountAmount(500_00, { pct: 0 })).toThrow(/above zero/);
    expect(() => discountAmount(500_00, { amountMinor: 600_00 })).toThrow(/more than the visit price/);
  });
});

const TAG = "TESTDISC";
let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`;
const DAY = "2037-06-14";
const perms = (...keys: PermissionKey[]) => new Set(keys);
const SPECIALIST = perms(P.BOOKING_VIEW, P.DISCOUNT_GIVE);
const MANAGER = perms(P.BOOKING_VIEW, P.DISCOUNT_GIVE, P.DISCOUNT_APPROVE);
let lina = "";
let hana = "";
let manager = "";
let serviceId = "";
let roomId = "";
let clientId = "";

async function visit(staff = lina) {
  const startAt = centerLocalToUtc(DAY, 600 + n * 50);
  const b = await prisma.booking.create({
    data: {
      clientProfileId: clientId,
      status: "CHECKED_IN",
      appointments: { create: { serviceId, staffUserId: staff, roomId, startAt, endAt: new Date(startAt.getTime() + 45 * 60_000), priceMinorSnapshot: 500_00 } },
    },
    include: { appointments: true },
  });
  return { bookingId: b.id, appointmentId: b.appointments[0]!.id };
}

beforeAll(async () => {
  const slug = `testdisc-${uid()}`;
  const dept = await prisma.department.create({ data: { slug, nameEn: "T", nameAr: "ت", taglineEn: "", taglineAr: "", descEn: "", descAr: "" } });
  serviceId = (await prisma.service.create({ data: { departmentId: dept.id, slug, nameEn: "Peel", nameAr: "تقشير", summaryEn: "", summaryAr: "", benefitsEn: [], benefitsAr: [], priceMinor: 500_00, durationMin: 45 } as never })).id;
  const staff = async (name: string, cap?: number) =>
    (await prisma.user.create({
      data: { type: "STAFF", isActive: true, email: `${TAG.toLowerCase()}-${uid()}@test.local`, staffProfile: { create: { fullName: name } }, ...(cap !== undefined ? { employeeRecord: { create: { discountCapPct: cap } } } : {}) },
    })).id;
  lina = await staff(`${TAG} Lina`);
  hana = await staff(`${TAG} Hana`, 20);
  manager = await staff(`${TAG} Manager`);
  roomId = (await prisma.room.create({ data: { name: `${TAG} room ${uid()}` } })).id;
  clientId = (await prisma.user.create({ data: { type: "CLIENT", phone: `+9665${TAG}${uid()}`, clientProfile: { create: { fullName: `${TAG} Noura` } } }, include: { clientProfile: true } })).clientProfile!.id;
});

afterAll(async () => {
  const bookings = await prisma.booking.findMany({ where: { clientProfileId: clientId }, select: { id: true } });
  await prisma.invoice.deleteMany({ where: { bookingId: { in: bookings.map((b) => b.id) } } });
  await prisma.booking.deleteMany({ where: { clientProfileId: clientId } });
  await prisma.user.deleteMany({ where: { OR: [{ email: { startsWith: TAG.toLowerCase() } }, { phone: { startsWith: `+9665${TAG}` } }] } });
  await prisma.room.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.service.deleteMany({ where: { slug: { startsWith: "testdisc-" } } });
  await prisma.department.deleteMany({ where: { slug: { startsWith: "testdisc-" } } });
});

describe("specialist discounts", () => {
  it("within the cap applies at once and pre-fills the invoice line", async () => {
    const v = await visit();
    const res = await giveDiscount({ appointmentId: v.appointmentId, byUserId: lina, permissions: SPECIALIST, pct: 10, reason: "Returning customer" });
    expect(res).toEqual({ status: "APPLIED", amountMinor: 50_00, pctBp: 1000 });
    const draft = await createDraftFromBooking(v.bookingId);
    const lines = await prisma.invoiceLine.findMany({ where: { invoiceId: draft.id } });
    // Stored VAT-exclusive; the inclusive 50 SAR discount is ≈ 43.48 excl.
    expect(lines[0]!.discountMinor).toBeGreaterThan(0);
    expect(lines[0]!.staffUserId).toBe(lina);
    expect(draft.notes).toContain("Returning customer");
  });

  it("above her cap waits for a manager; a manager approves; two approvals can't both win", async () => {
    const v = await visit();
    const res = await giveDiscount({ appointmentId: v.appointmentId, byUserId: lina, permissions: SPECIALIST, pct: 15, reason: "Session ran over" });
    expect(res.status).toBe("PENDING");
    await expect(decideDiscount(v.appointmentId, lina, SPECIALIST, true)).rejects.toThrow(/Only a manager/);
    const results = await Promise.allSettled([decideDiscount(v.appointmentId, manager, MANAGER, true), decideDiscount(v.appointmentId, manager, MANAGER, true)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await prisma.appointmentDiscount.findUniqueOrThrow({ where: { appointmentId: v.appointmentId } })).status).toBe("APPLIED");
  });

  it("a personal cap in the HR file wins over the default", async () => {
    const v = await visit(hana);
    const res = await giveDiscount({ appointmentId: v.appointmentId, byUserId: hana, permissions: SPECIALIST, pct: 18, reason: "Introductory offer" });
    expect(res.status).toBe("APPLIED");
  });

  it("only her own customers, needs a reason, and locks once the invoice is issued", async () => {
    const v = await visit(hana);
    await expect(giveDiscount({ appointmentId: v.appointmentId, byUserId: lina, permissions: SPECIALIST, pct: 5, reason: "x" })).rejects.toThrow(/own customers/);
    await expect(giveDiscount({ appointmentId: v.appointmentId, byUserId: hana, permissions: SPECIALIST, pct: 5, reason: "  " })).rejects.toThrow(/why/);
    await expect(giveDiscount({ appointmentId: v.appointmentId, byUserId: hana, permissions: perms(P.BOOKING_VIEW), pct: 5, reason: "x" })).rejects.toThrow(/permission/);

    await giveDiscount({ appointmentId: v.appointmentId, byUserId: hana, permissions: SPECIALIST, pct: 5, reason: "Returning customer" });
    const draft = await createDraftFromBooking(v.bookingId);
    await prisma.invoice.update({ where: { id: draft.id }, data: { status: "ISSUED", issuedAt: new Date() } });
    await lockDiscountsToInvoice(v.bookingId, draft.id);
    await expect(removeDiscount(v.appointmentId, hana, SPECIALIST)).rejects.toThrow(/already issued/);
    await expect(giveDiscount({ appointmentId: v.appointmentId, byUserId: hana, permissions: SPECIALIST, pct: 8, reason: "x" })).rejects.toThrow(/already issued/);
    expect((await prisma.appointmentDiscount.findUniqueOrThrow({ where: { appointmentId: v.appointmentId } })).invoiceId).toBe(draft.id);
  });

  it("a discount given after the draft was opened updates that draft", async () => {
    const v = await visit();
    const draft = await createDraftFromBooking(v.bookingId);
    const before = await prisma.invoice.findUniqueOrThrow({ where: { id: draft.id } });
    await giveDiscount({ appointmentId: v.appointmentId, byUserId: lina, permissions: SPECIALIST, amountMinor: 40_00, reason: "Returning customer" });
    await syncDraftDiscount(v.bookingId, { serviceId, staffUserId: lina }, 40_00, 0);
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: draft.id } });
    expect(before.totalMinor - after.totalMinor).toBe(40_00);
  });
});
