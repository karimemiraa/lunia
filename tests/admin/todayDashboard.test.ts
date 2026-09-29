import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { attentionCards, occupancyPercent, getTodayDashboard, nowStrip } from "@/modules/dashboard/today";
import { utcToCenterLocal } from "@/modules/booking/availability";
import type { NotificationFeed } from "@/modules/notifications/feed";
import type { DayAppointmentRow } from "@/modules/booking/bookings";

const emptyFeed: NotificationFeed = { total: 0, counts: {}, items: [] };

function row(startMin: number, durMin: number, status: DayAppointmentRow["status"] = "CONFIRMED"): DayAppointmentRow {
  const startAt = new Date(Date.UTC(2026, 0, 1, 0, startMin));
  return {
    bookingId: "b", appointmentId: "a", status, channel: "ONLINE", startAt, endAt: new Date(startAt.getTime() + durMin * 60_000),
    serviceId: "s", serviceName: "S", staffUserId: "u", staffName: "U", roomId: "r", roomName: "R", clientProfileId: "c", clientName: "C", clientPhone: null,
    centerNote: null, customerNote: null,
  };
}

describe("attentionCards", () => {
  it("builds ordered cards from true per-type counts and skips zeros", () => {
    const cards = attentionCards({ total: 9, counts: { invoice: 4, callback: 2, stock: 0, whatsapp: 3 }, items: [] });
    expect(cards.map((c) => [c.type, c.count])).toEqual([["callback", 2], ["invoice", 4], ["whatsapp", 3]]);
    expect(cards[1]?.href).toBe("/admin/billing?status=ISSUED");
    expect(cards[1]?.tone).toBe("danger");
  });
});

describe("occupancyPercent", () => {
  it("is booked minutes over rooms x open minutes, ignoring cancellations", () => {
    const rows = [row(600, 60), row(660, 60), row(720, 120, "CANCELLED")];
    // 120 booked minutes / (2 rooms x 600 open minutes)
    expect(occupancyPercent(rows, 2, 600)).toBe(10);
  });
  it("is null when closed or without rooms", () => {
    expect(occupancyPercent([row(600, 60)], 0, 600)).toBeNull();
    expect(occupancyPercent([row(600, 60)], 2, null)).toBeNull();
  });
});

describe("getTodayDashboard (DB)", () => {
  const TAG = `td${Date.now().toString(36)}`;
  let staffId = "";
  const todayISO = utcToCenterLocal(new Date()).dateISO;

  beforeAll(async () => {
    const staff = await prisma.user.create({
      data: { type: "STAFF", email: `${TAG}@staff.test`, staffProfile: { create: { fullName: `Clocked ${TAG}` } } },
    });
    staffId = staff.id;
    await prisma.attendanceRecord.create({ data: { userId: staffId, dateISO: todayISO, clockInAt: new Date() } });
  });

  afterAll(async () => {
    await prisma.attendanceRecord.deleteMany({ where: { userId: staffId } });
    await prisma.user.delete({ where: { id: staffId } }).catch(() => {});
  });

  it("lists who is clocked in right now", async () => {
    const strip = await nowStrip(new Date(), todayISO, true);
    expect(strip.clockedIn.map((s) => s.userId)).toContain(staffId);
    expect(strip.roomsInUse).toBeLessThanOrEqual(Math.max(strip.roomsTotal, strip.roomsInUse));
  });

  it("omits blocks the viewer cannot see", async () => {
    const limited = await getTodayDashboard({ permissions: new Set() }, emptyFeed);
    expect(limited.arrivals).toBeNull();
    expect(limited.week).toBeNull();
    expect(limited.spark).toBeNull();
    expect(limited.kpis).toEqual({ revenueTodayMinor: null, appointmentsToday: null, newCustomersToday: null, occupancyPct: null });
    expect(limited.now.clockedIn.map((s) => s.userId)).toContain(staffId);
  });

  it("assembles every block for a full-permission viewer", async () => {
    const perms = new Set([PERMISSIONS.BOOKING_VIEW, PERMISSIONS.BILLING_MANAGE, PERMISSIONS.CLIENT_VIEW]);
    const full = await getTodayDashboard({ permissions: perms }, { total: 1, counts: { callback: 1 }, items: [] });
    expect(full.todayISO).toBe(todayISO);
    expect(Array.isArray(full.arrivals)).toBe(true);
    expect(full.week).toHaveLength(7);
    expect(full.week?.some((d) => d.isToday)).toBe(true);
    expect(full.spark).toHaveLength(7);
    expect(full.spark?.[6]?.dateISO).toBe(todayISO);
    expect(typeof full.kpis.revenueTodayMinor).toBe("number");
    expect(typeof full.kpis.newCustomersToday).toBe("number");
    expect(full.attention).toEqual([expect.objectContaining({ type: "callback", count: 1 })]);
  });
});
