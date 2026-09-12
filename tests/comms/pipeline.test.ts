// End-to-end tests for the outbox delivery pipeline wired to the real
// message-template registry (comms/templates.ts) instead of the old
// hardcoded renderMessageBody() call, plus the richer
// {serviceName, dateTime, bookingId} payload createBooking now schedules
// messages with. See src/modules/booking/outbox.ts (processDueMessages) and
// src/modules/booking/bookings.ts (createBooking).

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { scheduleMessage, processDueMessages } from "@/modules/booking/outbox";
import type { CommsSender } from "@/modules/booking/outbox";
import { createBooking } from "@/modules/booking/bookings";
import { centerLocalToUtc, utcToCenterLocal, weekdayForDateISO } from "@/modules/booking/availability";
import { localized } from "@/modules/catalog/localize";

// Every phone created by this suite carries this prefix so cleanup can find
// (and remove) everything it created, regardless of which test created it or
// whether an assertion failed partway through.
const PHONE_PREFIX = `+9665PIPELINE${Date.now()}`;
let phoneCounter = 0;
function freshPhone(): string {
  phoneCounter += 1;
  return `${PHONE_PREFIX}${phoneCounter}`;
}

// Same rationale as tests/booking/outbox.test.ts's beforeAll: processDueMessages
// scans the *entire* ScheduledMessage table for due PENDING rows, so a stray
// leftover row (from an earlier interrupted run, or another suite's
// immediately-due CONFIRMATION) would throw off this file's exact
// processed/sent counts. vitest.config.ts disables cross-file parallelism,
// so draining once up front is enough.
beforeAll(async () => {
  const drainSender: CommsSender = { send: async () => ({ ok: true, providerRef: "drain-preexisting-stray-row" }) };
  for (let i = 0; i < 20; i += 1) {
    const { processed } = await processDueMessages(new Date(), drainSender);
    if (processed === 0) break;
  }
});

afterEach(async () => {
  await prisma.communicationLog.deleteMany({ where: { toPhone: { startsWith: PHONE_PREFIX } } });
  await prisma.scheduledMessage.deleteMany({ where: { toPhone: { startsWith: PHONE_PREFIX } } });
});

describe("processDueMessages renders via the template registry", () => {
  it("renders a body containing the payload's serviceName + dateTime, sends it, and marks SENT + logs", async () => {
    const now = new Date();
    const phone = freshPhone();
    const scheduled = await scheduleMessage({
      kind: "CONFIRMATION",
      toPhone: phone,
      locale: "en",
      sendAt: new Date(now.getTime() - 60_000),
      payload: { bookingId: "b-pipeline-1", serviceName: "HydraFacial", dateTime: "Sep 10, 5:00 PM" },
    });

    const sent: Array<{ toPhone?: string; body: string; channel: string; kind: string }> = [];
    const fakeSender: CommsSender = {
      send: async (msg) => {
        sent.push(msg);
        return { ok: true, providerRef: "fake-pipeline-ref" };
      },
    };

    const result = await processDueMessages(now, fakeSender);
    expect(result.processed).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);

    expect(sent.length).toBe(1);
    expect(sent[0]!.body).toContain("HydraFacial");
    expect(sent[0]!.body).toContain("Sep 10, 5:00 PM");
    expect(sent[0]!.body).not.toContain("{{");

    const updated = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: scheduled.id } });
    expect(updated.status).toBe("SENT");
    expect(updated.sentAt).not.toBeNull();

    const logs = await prisma.communicationLog.findMany({ where: { toPhone: phone } });
    expect(logs.length).toBe(1);
    expect(logs[0]!.status).toBe("SENT");
    expect(logs[0]!.body).toContain("HydraFacial");
    expect(logs[0]!.body).toContain("Sep 10, 5:00 PM");
  });

  it("marks FAILED and logs a FAILED row when the sender reports failure, body still rendered from the template", async () => {
    const now = new Date();
    const phone = freshPhone();
    const scheduled = await scheduleMessage({
      kind: "REMINDER_24H",
      toPhone: phone,
      locale: "en",
      sendAt: new Date(now.getTime() - 60_000),
      payload: { bookingId: "b-pipeline-2", serviceName: "Deep Tissue Massage", dateTime: "Sep 11, 9:00 AM" },
    });

    const failingSender: CommsSender = { send: async () => ({ ok: false }) };

    const result = await processDueMessages(now, failingSender);
    expect(result.processed).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);

    const updated = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: scheduled.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.sentAt).toBeNull();

    const logs = await prisma.communicationLog.findMany({ where: { toPhone: phone } });
    expect(logs.length).toBe(1);
    expect(logs[0]!.status).toBe("FAILED");
    expect(logs[0]!.body).toContain("Deep Tissue Massage");
    expect(logs[0]!.body).toContain("Sep 11, 9:00 AM");
  });
});

describe("createBooking schedules messages with a richer payload", () => {
  async function getUnGatedService() {
    return prisma.service.findUniqueOrThrow({ where: { slug: "diagnostic-skin-analysis" } });
  }

  // Finds a bookable ISO date at least a few days out, snapped forward to a
  // center-open weekday (Sun-Thu), mirroring tests/booking/bookings.test.ts's
  // openDateAt helper -- avoids colliding with the past-time guard and
  // guarantees the day actually has business hours.
  function openDateAt(daysOut: number): string {
    let t = Date.now() + daysOut * 86_400_000;
    for (;;) {
      const dateISO = utcToCenterLocal(new Date(t)).dateISO;
      if (weekdayForDateISO(dateISO) <= 4) return dateISO;
      t += 86_400_000;
    }
  }

  it("schedules CONFIRMATION with payload.serviceName (localized) and a non-empty payload.dateTime", async () => {
    const service = await getUnGatedService();
    const phone = freshPhone();
    const dateISO = openDateAt(200 + Math.floor(Math.random() * 100));
    const startAt = centerLocalToUtc(dateISO, 600); // 10:00 center-local

    const booking = await createBooking({
      serviceId: service.id,
      startAt,
      client: { name: "Pipeline Test Client", phone },
      channel: "ONLINE",
      locale: "en",
    });

    const confirmation = await prisma.scheduledMessage.findFirstOrThrow({
      where: { bookingId: booking.id, kind: "CONFIRMATION" },
    });
    const payload = confirmation.payload as Record<string, unknown>;
    expect(payload.serviceName).toBe(localized("en", service.nameEn, service.nameAr));
    expect(typeof payload.dateTime).toBe("string");
    expect((payload.dateTime as string).length).toBeGreaterThan(0);
    expect(payload.bookingId).toBe(booking.id);

    // The rendered body actually carries the real details through
    // renderTemplate, end to end.
    const sent: Array<{ body: string }> = [];
    const fakeSender: CommsSender = {
      send: async (msg) => {
        sent.push(msg);
        return { ok: true, providerRef: "fake-pipeline-booking-ref" };
      },
    };
    const now = new Date();
    await processDueMessages(now, fakeSender);
    const rendered = sent.find((m) => m.body.includes(payload.serviceName as string));
    expect(rendered).toBeDefined();
    expect(rendered!.body).toContain(payload.dateTime as string);

    // Cleanup: this test's own scheduled rows aren't caught by the
    // PHONE_PREFIX-scoped afterEach's toPhone filter timing (createBooking
    // schedules under the same freshPhone(), so it is covered) -- but the
    // booking/appointment/client rows it created are not, so remove them
    // explicitly.
    await prisma.scheduledMessage.deleteMany({ where: { bookingId: booking.id } });
    await prisma.appointment.deleteMany({ where: { bookingId: booking.id } });
    await prisma.booking.delete({ where: { id: booking.id } });
    const client = await prisma.clientProfile.findUnique({ where: { id: booking.clientProfileId }, include: { user: true } });
    if (client) {
      await prisma.clientProfile.delete({ where: { id: client.id } });
      await prisma.user.delete({ where: { id: client.userId } });
    }
  });
});
