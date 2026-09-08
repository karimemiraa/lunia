import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";

describe("booking models (post-seed)", () => {
  it("seeded services have a positive durationMin and priceMinor", async () => {
    const services = await prisma.service.findMany();
    expect(services.length).toBeGreaterThan(0);
    for (const svc of services) {
      expect(svc.durationMin).toBeGreaterThan(0);
      expect(svc.priceMinor).toBeGreaterThan(0);
    }
  });

  it("seeded a specialist staff user with a weekly StaffSchedule, alongside the owner's", async () => {
    const specialist = await prisma.user.findUnique({ where: { email: "specialist@lunia.local" } });
    expect(specialist).not.toBeNull();
    expect(specialist?.type).toBe("STAFF");

    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@lunia.local" } });

    for (const staffUserId of [owner.id, specialist!.id]) {
      const schedules = await prisma.staffSchedule.findMany({ where: { staffUserId } });
      expect(schedules.length).toBe(5); // Sun-Thu
      const weekdays = schedules.map((s) => s.weekday).sort();
      expect(weekdays).toEqual([0, 1, 2, 3, 4]);
      for (const s of schedules) {
        expect(s.startMin).toBe(600);
        expect(s.endMin).toBe(1200);
        expect(s.isActive).toBe(true);
      }
    }
  });

  it("gates a premium service behind the vip tier via ServiceAccessRule, leaving others open", async () => {
    const vipTier = await prisma.membershipTier.findUniqueOrThrow({ where: { key: "vip" } });
    const gated = await prisma.service.findUniqueOrThrow({ where: { slug: "signature-facials-hydrafacial" } });
    const rule = await prisma.serviceAccessRule.findUnique({ where: { serviceId: gated.id } });
    expect(rule?.minTierId).toBe(vipTier.id);

    const open = await prisma.service.findUniqueOrThrow({ where: { slug: "diagnostic-skin-analysis" } });
    const openRule = await prisma.serviceAccessRule.findUnique({ where: { serviceId: open.id } });
    expect(openRule).toBeNull();
  });

  it("round-trips a Room, Booking, and Appointment with relations and enum defaults", async () => {
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@lunia.local" } });
    const clientUser = await prisma.user.create({
      data: {
        type: "CLIENT",
        email: `booking-test-client-${Date.now()}@example.com`,
        clientProfile: { create: { fullName: "Booking Test Client" } },
      },
      include: { clientProfile: true },
    });
    const service = await prisma.service.findUniqueOrThrow({ where: { slug: "diagnostic-skin-analysis" } });

    const room = await prisma.room.create({
      data: { name: "Test Room", capacity: 1, order: 99 },
    });

    const startAt = new Date("2026-10-01T10:00:00.000Z");
    const endAt = new Date("2026-10-01T11:00:00.000Z");

    const booking = await prisma.booking.create({
      data: {
        clientProfileId: clientUser.clientProfile!.id,
        appointments: {
          create: {
            serviceId: service.id,
            staffUserId: owner.id,
            roomId: room.id,
            startAt,
            endAt,
            priceMinorSnapshot: service.priceMinor,
          },
        },
      },
      include: { appointments: true },
    });

    try {
      expect(booking.status).toBe("CONFIRMED");
      expect(booking.channel).toBe("ONLINE");
      expect(booking.depositStatus).toBe("NONE");
      expect(booking.appointments.length).toBe(1);
      expect(booking.appointments[0]?.roomId).toBe(room.id);

      const checkIn = await prisma.checkIn.create({
        data: { bookingId: booking.id },
      });
      expect(checkIn.seatedAt).toBeNull();

      const fetched = await prisma.booking.findUniqueOrThrow({
        where: { id: booking.id },
        include: { appointments: { include: { service: true, staff: true, room: true } }, checkIn: true },
      });
      expect(fetched.appointments[0]?.service.slug).toBe("diagnostic-skin-analysis");
      expect(fetched.appointments[0]?.staff.email).toBe("owner@lunia.local");
      expect(fetched.appointments[0]?.room.name).toBe("Test Room");
      expect(fetched.checkIn?.bookingId).toBe(booking.id);

      const message = await prisma.scheduledMessage.create({
        data: {
          bookingId: booking.id,
          kind: "CONFIRMATION",
          toPhone: "+9665XXXXXXXX",
          locale: "en",
          sendAt: new Date(),
          payload: { template: "confirmation" },
        },
      });
      expect(message.status).toBe("PENDING");
      await prisma.scheduledMessage.delete({ where: { id: message.id } });
    } finally {
      await prisma.checkIn.deleteMany({ where: { bookingId: booking.id } });
      await prisma.appointment.deleteMany({ where: { bookingId: booking.id } });
      await prisma.booking.delete({ where: { id: booking.id } });
      await prisma.room.delete({ where: { id: room.id } });
      await prisma.clientProfile.delete({ where: { id: clientUser.clientProfile!.id } });
      await prisma.user.delete({ where: { id: clientUser.id } });
    }
  });
});
