// "Test Customer (demo)": a clearly-labelled, idempotent test account so the
// team can see the whole customer journey with realistic data (membership,
// points, bookings, gift card, package, health profile, signed consent,
// treatment record). Run with `pnpm demo:customer`; running it again refreshes
// the same records (e.g. moves the upcoming booking forward) instead of
// creating duplicates.
//
// Safety: the email uses the reserved .test TLD (no real mail can be sent),
// there is no phone number (no SMS/WhatsApp), bookings are written directly
// (no confirmation/reminder messages are scheduled), and the "test" tag keeps
// it out of dashboards and reports (see crm/testCustomers.ts).

import { deflateSync } from "node:zlib";
import { prisma } from "@/lib/db";
import { centerLocalToUtc, overlaps, utcToCenterLocal, weekdayForDateISO } from "@/modules/booking/availability";
import { issueGiftCard } from "@/modules/commerce/giftcards";
import { refreshClientLtv } from "@/modules/crm/ltv";
import { TEST_CUSTOMER_TAG } from "@/modules/crm/testCustomers";
import { submitIntake } from "./intake";
import { CONSENT_KEYS, ensureDefaultConsentForms, signConsent } from "./consents";
import { createTreatmentRecord } from "./treatments";

export const DEMO_EMAIL = "demo.customer@lunia.test";
export const DEMO_NAME = "Test Customer (demo)";
const UPCOMING_NOTE = "[demo] upcoming booking";
const PAST_NOTE = "[demo] completed booking";
const DEMO_PACKAGE_NAME = "Demo package (test)";
const LOYALTY_REASON = "DEMO";
const DAY_MS = 86_400_000;

// --- A small drawn-looking signature PNG, generated (no binary fixture) -------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A 320x100 transparent PNG with a pen-like wave, as a data URL. */
export function demoSignatureDataUrl(): string {
  const w = 320;
  const h = 100;
  const px = Buffer.alloc(w * h * 4);
  const plot = (x: number, y: number) => {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const X = Math.round(x) + dx;
        const Y = Math.round(y) + dy;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const i = (Y * w + X) * 4;
        px[i] = 0x16;
        px[i + 1] = 0x30;
        px[i + 2] = 0x2d;
        px[i + 3] = 255;
      }
  };
  for (let x = 20; x < 300; x += 0.25) plot(x, 55 + Math.sin(x / 11) * 18 * Math.cos(x / 53));
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

// --- Helpers ------------------------------------------------------------------

async function pickService(preferredSlugs: string[]) {
  for (const slug of preferredSlugs) {
    const s = await prisma.service.findUnique({ where: { slug } });
    if (s && s.isPublished) return s;
  }
  const fallback = await prisma.service.findFirst({ where: { isPublished: true }, orderBy: { order: "asc" } });
  if (!fallback) throw new Error("No published services in the database. Run the seed first.");
  return fallback;
}

interface Slot {
  staffUserId: string;
  roomId: string;
  startAt: Date;
  endAt: Date;
}

// A slot 3-21 days ahead placed right AFTER a staff member's shift ends, so
// the demo booking shows up like a real upcoming visit but can never take a
// bookable slot from a real customer (this also runs against production).
// Skips anything overlapping existing appointments. Falls back to 3 days
// ahead at 22:30 if the schedules are empty.
async function findUpcomingSlot(durationMin: number, now: Date, ignoreAppointmentId?: string): Promise<Slot> {
  const [schedules, rooms] = await Promise.all([
    prisma.staffSchedule.findMany({ where: { isActive: true, staff: { isActive: true, type: "STAFF" } }, orderBy: { startMin: "asc" } }),
    prisma.room.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
  ]);
  if (rooms.length === 0) throw new Error("No active rooms. Run the seed first.");

  for (let offset = 3; offset <= 21; offset++) {
    const dateISO = utcToCenterLocal(new Date(now.getTime() + offset * DAY_MS)).dateISO;
    const weekday = weekdayForDateISO(dateISO);
    for (const sch of schedules.filter((s) => s.weekday === weekday)) {
      for (let start = sch.endMin; start + durationMin <= 24 * 60; start += 30) {
        const startAt = centerLocalToUtc(dateISO, start);
        const endAt = centerLocalToUtc(dateISO, start + durationMin);
        const busy = await prisma.appointment.findMany({
          where: {
            id: ignoreAppointmentId ? { not: ignoreAppointmentId } : undefined,
            startAt: { lt: endAt },
            endAt: { gt: startAt },
            booking: { status: { notIn: ["CANCELLED", "NO_SHOW"] } },
          },
          select: { staffUserId: true, roomId: true, startAt: true, endAt: true },
        });
        if (busy.some((b) => b.staffUserId === sch.staffUserId && overlaps(b.startAt, b.endAt, startAt, endAt))) continue;
        const room = rooms.find((r) => !busy.some((b) => b.roomId === r.id));
        if (room) return { staffUserId: sch.staffUserId, roomId: room.id, startAt, endAt };
      }
    }
  }

  const staff = await prisma.user.findFirst({ where: { type: "STAFF", isActive: true }, orderBy: { createdAt: "asc" } });
  if (!staff) throw new Error("No staff users. Run the seed first.");
  const dateISO = utcToCenterLocal(new Date(now.getTime() + 3 * DAY_MS)).dateISO;
  const lateMin = Math.min(22 * 60 + 30, 24 * 60 - durationMin);
  return { staffUserId: staff.id, roomId: rooms[0].id, startAt: centerLocalToUtc(dateISO, lateMin), endAt: centerLocalToUtc(dateISO, lateMin + durationMin) };
}

// --- Main -------------------------------------------------------------------------

export interface DemoCustomerSummary {
  userId: string;
  clientProfileId: string;
  upcomingBookingId: string;
  pastBookingId: string;
  giftCardCode: string;
  packagePurchaseId: string;
  consentSignatureId: string;
  treatmentRecordId: string;
}

export async function ensureDemoCustomer(now: Date = new Date()): Promise<DemoCustomerSummary> {
  // 1. Account + profile.
  const existingUser = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existingUser && existingUser.type !== "CLIENT") throw new Error(`${DEMO_EMAIL} belongs to a staff account; refusing to touch it.`);
  const user =
    existingUser ??
    (await prisma.user.create({ data: { type: "CLIENT", email: DEMO_EMAIL, locale: "ar" } }));
  const tags = [TEST_CUSTOMER_TAG, "demo"];
  const profile = await prisma.clientProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, fullName: DEMO_NAME, tags, sourceChannel: "demo", stage: "active" },
    update: { fullName: DEMO_NAME },
  });
  if (!tags.every((t) => profile.tags.includes(t))) {
    await prisma.clientProfile.update({ where: { id: profile.id }, data: { tags: [...new Set([...profile.tags, ...tags])] } });
  }
  const clientProfileId = profile.id;

  // 2. Membership tier.
  const tier =
    (await prisma.membershipTier.findUnique({ where: { key: "member" } })) ??
    (await prisma.membershipTier.findFirst({ orderBy: { priority: "asc" } }));
  if (tier) {
    await prisma.clientMembership.upsert({
      where: { clientId: clientProfileId },
      create: { clientId: clientProfileId, tierId: tier.id },
      update: { tierId: tier.id },
    });
  }

  // 3. Loyalty points (one DEMO ledger row; balance = ledger sum).
  const hasDemoPoints = await prisma.loyaltyTransaction.findFirst({ where: { clientProfileId, reason: LOYALTY_REASON } });
  if (!hasDemoPoints) {
    await prisma.loyaltyTransaction.create({ data: { clientProfileId, deltaPoints: 750, reason: LOYALTY_REASON } });
  }
  const pointsSum = await prisma.loyaltyTransaction.aggregate({ where: { clientProfileId }, _sum: { deltaPoints: true } });
  await prisma.loyaltyAccount.upsert({
    where: { clientProfileId },
    create: { clientProfileId, pointsBalance: pointsSum._sum.deltaPoints ?? 0 },
    update: { pointsBalance: pointsSum._sum.deltaPoints ?? 0 },
  });

  // 4. Bookings: one upcoming (kept in the future on every run), one completed.
  const upcomingService = await pickService(["signature-facials-hydrafacial", "led-light-therapy"]);
  const pastService = await pickService(["diagnostic-skin-analysis", "signature-facials-hydrafacial"]);

  let upcoming = await prisma.booking.findFirst({ where: { clientProfileId, notes: UPCOMING_NOTE }, include: { appointments: true } });
  const upcomingAppt = upcoming?.appointments[0];
  if (!upcoming || !upcomingAppt || upcomingAppt.startAt.getTime() < now.getTime() + DAY_MS || upcoming.status !== "CONFIRMED") {
    const slot = await findUpcomingSlot(upcomingService.durationMin, now, upcomingAppt?.id);
    if (upcoming && upcomingAppt) {
      await prisma.appointment.update({ where: { id: upcomingAppt.id }, data: { ...slot, serviceId: upcomingService.id } });
      await prisma.booking.update({ where: { id: upcoming.id }, data: { status: "CONFIRMED" } });
    } else {
      upcoming = await prisma.booking.create({
        data: {
          clientProfileId,
          status: "CONFIRMED",
          channel: "FRONT_DESK",
          sourceChannel: "demo",
          notes: UPCOMING_NOTE,
          appointments: { create: { ...slot, serviceId: upcomingService.id, priceMinorSnapshot: upcomingService.priceMinor } },
        },
        include: { appointments: true },
      });
    }
  }

  let past = await prisma.booking.findFirst({ where: { clientProfileId, notes: PAST_NOTE }, include: { appointments: true } });
  if (!past) {
    const slot = await findUpcomingSlot(pastService.durationMin, new Date(now.getTime() - 24 * DAY_MS));
    past = await prisma.booking.create({
      data: {
        clientProfileId,
        status: "COMPLETED",
        channel: "FRONT_DESK",
        sourceChannel: "demo",
        notes: PAST_NOTE,
        createdAt: new Date(slot.startAt.getTime() - 7 * DAY_MS),
        appointments: { create: { ...slot, serviceId: pastService.id, priceMinorSnapshot: pastService.priceMinor } },
      },
      include: { appointments: true },
    });
  }
  await refreshClientLtv(clientProfileId);
  const pastAppt = past.appointments[0];

  // 5. Gift card (random code, created once).
  const giftCard =
    (await prisma.giftCard.findFirst({ where: { issuedToClientId: clientProfileId } })) ??
    (await issueGiftCard({ initialMinor: 20_000, issuedToClientId: clientProfileId, expiresAt: new Date(now.getTime() + 365 * DAY_MS) }));

  // 6. Package purchase, on an inactive demo package so it's never offered for sale.
  const pkg =
    (await prisma.servicePackage.findFirst({ where: { nameEn: DEMO_PACKAGE_NAME } })) ??
    (await prisma.servicePackage.create({
      data: {
        nameEn: DEMO_PACKAGE_NAME,
        nameAr: "باقة تجريبية (اختبار)",
        serviceId: upcomingService.id,
        sessionsTotal: 5,
        priceMinor: upcomingService.priceMinor * 4,
        isActive: false,
      },
    }));
  const purchase =
    (await prisma.packagePurchase.findFirst({ where: { clientProfileId, packageId: pkg.id } })) ??
    (await prisma.packagePurchase.create({ data: { clientProfileId, packageId: pkg.id, sessionsRemaining: 4, status: "ACTIVE" } }));

  // 7. Submitted health questionnaire (dated before the completed visit).
  if (!(await prisma.medicalIntake.findFirst({ where: { clientProfileId } }))) {
    const intake = await submitIntake({
      clientProfileId,
      submittedBy: "CLIENT",
      answers: {
        skinType: "combination",
        concerns: ["pigmentation", "dullness"],
        goals: "Even skin tone and more glow (demo data)",
        medications: ["topicalRetinoids"],
        allergies: "",
        sunExposure: "moderate",
        notes: "This is a demo test account.",
      },
    });
    await prisma.medicalIntake.update({ where: { id: intake.id }, data: { createdAt: new Date(pastAppt.startAt.getTime() - 2 * DAY_MS) } });
  }

  // 8. Signed general treatment consent.
  await ensureDefaultConsentForms();
  const general = await prisma.consentForm.findUnique({ where: { key: CONSENT_KEYS.GENERAL } });
  if (!general) throw new Error("General treatment consent form is missing");
  const signature =
    (await prisma.consentSignature.findFirst({ where: { clientProfileId, consentFormId: general.id } })) ??
    (await signConsent({
      clientProfileId,
      consentFormId: general.id,
      signerName: DEMO_NAME,
      signatureData: demoSignatureDataUrl(),
      locale: "ar",
      bookingId: past.id,
    }));

  // 9. Treatment record for the completed visit.
  const record =
    (await prisma.treatmentRecord.findUnique({ where: { appointmentId: pastAppt.id } })) ??
    (await createTreatmentRecord({
      clientProfileId,
      appointmentId: pastAppt.id,
      serviceId: pastAppt.serviceId,
      performedById: pastAppt.staffUserId,
      performedAt: pastAppt.startAt,
      settings: [
        { key: "Device", value: "Skin analyzer (demo)" },
        { key: "Mode / program", value: "Full-face analysis" },
      ],
      productsUsed: [{ name: "Gentle cleanser", qty: "1", unit: "pump" }],
      notes: "Demo record: baseline analysis, mild pigmentation on cheeks. Plan: Hydrafacial course.",
      skinReaction: "None",
      followUpAt: upcoming!.appointments[0]?.startAt ?? null,
    }));

  const upcomingFresh = await prisma.booking.findFirstOrThrow({ where: { clientProfileId, notes: UPCOMING_NOTE } });
  return {
    userId: user.id,
    clientProfileId,
    upcomingBookingId: upcomingFresh.id,
    pastBookingId: past.id,
    giftCardCode: giftCard.code,
    packagePurchaseId: purchase.id,
    consentSignatureId: signature.id,
    treatmentRecordId: record.id,
  };
}
