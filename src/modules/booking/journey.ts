// The in-clinic visit journey (docs/PRD-visit-journey.md): what happens
// between "checked in" and "completed".
//
//   WAITING ─receive→ CONSULTATION ─start→ TREATMENT ─finish→ CHECKOUT ─close→ DONE
//                └─────receive (no consultation)──┘
//
// Booking.status is untouched here: it stays CHECKED_IN for the whole visit
// and becomes COMPLETED through bookings.complete(), which calls markDone().
// Every stage change and handoff is written to VisitEvent so the visit's
// timeline (who took over, when, how long each step took) is never lost.

import type { CheckIn, VisitStage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSetting, DEFAULT_JOURNEY_SETTINGS, type JourneySettings } from "@/modules/cms/settings";
import { CONSENT_KEYS } from "@/modules/clinical/consentDefaults";
import { centerLocalToUtc, utcToCenterLocal } from "./availability";

export class JourneyError extends Error {}

export async function getJourneySettings(): Promise<JourneySettings> {
  return { ...DEFAULT_JOURNEY_SETTINGS, ...((await getSetting("journey").catch(() => null)) ?? {}) };
}

type Tx = Pick<typeof prisma, "checkIn" | "visitEvent" | "room" | "appointment" | "booking" | "invoice">;

async function visitOrThrow(bookingId: string): Promise<CheckIn> {
  const visit = await prisma.checkIn.findUnique({ where: { bookingId } });
  if (!visit) throw new JourneyError("This customer hasn't been checked in yet.");
  return visit;
}

function assertStage(visit: CheckIn, allowed: VisitStage[], action: string): void {
  if (!allowed.includes(visit.stage)) throw new JourneyError(`Can't ${action} — the customer is at the "${visit.stage}" step.`);
}

async function moveTo(tx: Tx, visit: CheckIn, stage: VisitStage, kind: string, byUserId: string | null, data: Partial<CheckIn> = {}, now = new Date()) {
  // Conditional on the current stage so two taps (or two devices) can't both win.
  const res = await tx.checkIn.updateMany({ where: { id: visit.id, stage: visit.stage }, data: { ...data, stage, stageAt: now } });
  if (res.count !== 1) throw new JourneyError("Someone else just updated this visit — refresh and try again.");
  await tx.visitEvent.create({ data: { checkInId: visit.id, stage, kind, byUserId, at: now } });
}

// ---- Arrival -----------------------------------------------------------------

/** Called by bookings.checkIn inside its transaction. */
export async function recordArrival(tx: Tx, checkInId: string, byUserId: string | null, now = new Date()): Promise<void> {
  await tx.visitEvent.create({ data: { checkInId, stage: "WAITING", kind: "arrived", byUserId, at: now } });
}

// ---- Payment gate ("pay before treatment" services) -----------------------------

export interface PaymentState {
  /** The service is set to be paid at reception before the room. */
  required: boolean;
  paid: boolean;
  overridden: boolean;
  invoiceId: string | null;
}

export async function paymentState(bookingId: string, db: Tx = prisma): Promise<PaymentState> {
  const [appts, invoice, visit] = await Promise.all([
    db.appointment.findMany({ where: { bookingId }, select: { service: { select: { payBeforeTreatment: true } } } }),
    db.invoice.findFirst({ where: { bookingId, kind: "INVOICE", status: { not: "VOID" } }, orderBy: { createdAt: "desc" }, select: { id: true, status: true } }),
    db.checkIn.findUnique({ where: { bookingId }, select: { paymentOverrideById: true } }),
  ]);
  return {
    required: appts.some((a) => a.service.payBeforeTreatment),
    paid: invoice?.status === "PAID",
    overridden: Boolean(visit?.paymentOverrideById),
    invoiceId: invoice?.id ?? null,
  };
}

/** Front desk lets an unpaid "pay before" customer through (logged). */
export async function overridePayment(bookingId: string, byUserId: string, note?: string): Promise<void> {
  const visit = await visitOrThrow(bookingId);
  await prisma.$transaction([
    prisma.checkIn.update({ where: { id: visit.id }, data: { paymentOverrideById: byUserId } }),
    prisma.visitEvent.create({ data: { checkInId: visit.id, stage: visit.stage, kind: "payment_override", byUserId, note: note?.trim().slice(0, 300) || null } }),
  ]);
}

async function assertMayEnterRoom(bookingId: string): Promise<void> {
  const p = await paymentState(bookingId);
  if (p.required && !p.paid && !p.overridden) throw new JourneyError("This service is paid before treatment — take the payment first, or let her in without payment.");
}

// ---- Consultation rule ------------------------------------------------------------

/** First visit to the clinic, or a service that always starts with one. */
export async function needsConsultation(bookingId: string): Promise<boolean> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { clientProfileId: true, appointments: { select: { service: { select: { needsConsultation: true } } } } },
  });
  if (!booking) return false;
  if (booking.appointments.some((a) => a.service.needsConsultation)) return true;
  const earlier = await prisma.booking.count({ where: { clientProfileId: booking.clientProfileId, status: "COMPLETED", id: { not: bookingId } } });
  return earlier === 0;
}

// ---- Transitions ------------------------------------------------------------------

/**
 * The specialist takes over from front desk. Goes to CONSULTATION when one is
 * due (or forced), otherwise straight to TREATMENT (payment gate applies).
 */
export async function receive(bookingId: string, byUserId: string, opts: { consultation?: boolean } = {}): Promise<VisitStage> {
  const visit = await visitOrThrow(bookingId);
  assertStage(visit, ["WAITING"], "receive the customer");
  const consult = opts.consultation ?? (await needsConsultation(bookingId));
  const now = new Date();
  if (consult) {
    await prisma.$transaction((tx) => moveTo(tx, visit, "CONSULTATION", "received", byUserId, { receivedAt: now, receivedById: byUserId, consultStartedAt: now }, now));
    return "CONSULTATION";
  }
  await assertMayEnterRoom(bookingId);
  await prisma.$transaction((tx) => moveTo(tx, visit, "TREATMENT", "received", byUserId, { receivedAt: now, receivedById: byUserId, seatedAt: visit.seatedAt ?? now }, now));
  return "TREATMENT";
}

/** Into the treatment room (from waiting or after the consultation). */
export async function startTreatment(bookingId: string, byUserId: string | null): Promise<void> {
  const visit = await visitOrThrow(bookingId);
  if (visit.stage === "TREATMENT") return; // idempotent (the old "Start" button)
  assertStage(visit, ["WAITING", "CONSULTATION"], "start the treatment");
  await assertMayEnterRoom(bookingId);
  const now = new Date();
  await prisma.$transaction((tx) =>
    moveTo(tx, visit, "TREATMENT", "treatment_started", byUserId, {
      seatedAt: visit.seatedAt ?? now,
      ...(visit.receivedAt ? {} : { receivedAt: now, receivedById: byUserId }),
    }, now),
  );
}

/** Treatment done: customer goes to checkout, the room needs preparing. */
export async function finishTreatment(bookingId: string, byUserId: string | null): Promise<void> {
  const visit = await visitOrThrow(bookingId);
  assertStage(visit, ["TREATMENT", "CONSULTATION"], "finish the treatment");
  const now = new Date();
  const roomIds = (await prisma.appointment.findMany({ where: { bookingId }, select: { roomId: true } })).map((a) => a.roomId);
  await prisma.$transaction(async (tx) => {
    await moveTo(tx, visit, "CHECKOUT", "treatment_finished", byUserId, { treatmentEndedAt: now }, now);
    if (roomIds.length) await tx.room.updateMany({ where: { id: { in: roomIds } }, data: { preparingSince: now } });
  });
}

/**
 * Closes the visit (bookings.complete calls this once the booking is
 * COMPLETED). Works from any stage so "Complete" on the calendar still does
 * the whole thing in one tap; missing timestamps stay empty rather than
 * being invented.
 */
export async function markDone(bookingId: string, byUserId: string | null, now = new Date()): Promise<void> {
  const visit = await prisma.checkIn.findUnique({ where: { bookingId } });
  if (!visit || visit.stage === "DONE") return;
  const fromTreatment = visit.stage === "TREATMENT";
  const roomIds = fromTreatment ? (await prisma.appointment.findMany({ where: { bookingId }, select: { roomId: true } })).map((a) => a.roomId) : [];
  await prisma.$transaction(async (tx) => {
    await moveTo(tx, visit, "DONE", "checked_out", byUserId, { checkedOutAt: now, checkedOutById: byUserId, ...(fromTreatment ? { treatmentEndedAt: now } : {}) }, now);
    if (roomIds.length) await tx.room.updateMany({ where: { id: { in: roomIds } }, data: { preparingSince: now } });
  });
}

/** Coffee/water served in the waiting area (ضيافة). */
export async function markHospitality(bookingId: string, byUserId: string): Promise<void> {
  const visit = await visitOrThrow(bookingId);
  if (visit.hospitalityAt) return;
  await prisma.$transaction([
    prisma.checkIn.update({ where: { id: visit.id }, data: { hospitalityAt: new Date() } }),
    prisma.visitEvent.create({ data: { checkInId: visit.id, stage: visit.stage, kind: "hospitality", byUserId } }),
  ]);
}

/** Specialists free to take this waiting customer right now (no overlapping visit). */
export async function availableSpecialists(bookingId: string): Promise<{ id: string; name: string; nameAr: string | null }[]> {
  const appt = await prisma.appointment.findFirst({ where: { bookingId }, orderBy: { startAt: "asc" } });
  if (!appt) return [];
  const now = new Date();
  const from = appt.startAt < now ? now : appt.startAt;
  const to = new Date(Math.max(appt.endAt.getTime(), from.getTime() + 15 * 60_000));
  const [staff, busy, inRoom] = await Promise.all([
    prisma.user.findMany({ where: { type: "STAFF", isActive: true, staffProfile: { isNot: null } }, select: { id: true, staffProfile: { select: { fullName: true, fullNameAr: true } } } }),
    prisma.appointment.findMany({
      where: { bookingId: { not: bookingId }, startAt: { lt: to }, endAt: { gt: from }, booking: { status: { in: ["CONFIRMED", "CHECKED_IN"] } } },
      select: { staffUserId: true },
    }),
    prisma.appointment.findMany({ where: { booking: { checkIn: { stage: { in: ["CONSULTATION", "TREATMENT"] } } } }, select: { staffUserId: true } }),
  ]);
  const taken = new Set([...busy, ...inRoom].map((a) => a.staffUserId));
  return staff
    .filter((s) => s.id !== appt.staffUserId && !taken.has(s.id))
    .map((s) => ({ id: s.id, name: s.staffProfile!.fullName, nameAr: s.staffProfile!.fullNameAr }));
}

/** Front desk hands a waiting customer to another free specialist. */
export async function reassign(bookingId: string, toStaffUserId: string, byUserId: string): Promise<void> {
  const visit = await visitOrThrow(bookingId);
  assertStage(visit, ["WAITING"], "hand the customer to someone else");
  const free = await availableSpecialists(bookingId);
  if (!free.some((s) => s.id === toStaffUserId)) throw new JourneyError("That specialist isn't free at this time.");
  await prisma.$transaction([
    prisma.appointment.updateMany({ where: { bookingId }, data: { staffUserId: toStaffUserId } }),
    prisma.visitEvent.create({ data: { checkInId: visit.id, stage: "WAITING", kind: "reassigned", byUserId, note: toStaffUserId } }),
  ]);
}

/** Room prepared for the next customer. */
export async function markRoomReady(roomId: string): Promise<void> {
  await prisma.room.update({ where: { id: roomId }, data: { preparingSince: null } });
}

// ---- Live board -------------------------------------------------------------------

export type BoardColumn = "EXPECTED" | VisitStage;

export interface BoardCard {
  bookingId: string;
  clientProfileId: string;
  clientName: string;
  phone: string | null;
  serviceName: string;
  serviceNameAr: string | null;
  staffUserId: string;
  staffName: string;
  staffNameAr: string | null;
  roomId: string;
  roomName: string;
  roomNameAr: string | null;
  startAt: string;
  endAt: string;
  durationMin: number;
  column: BoardColumn;
  /** When the current stage began (live timer); appointment time for EXPECTED. */
  since: string;
  arrivedAt: string | null;
  receivedAt: string | null;
  receivedByName: string | null;
  seatedAt: string | null;
  treatmentEndedAt: string | null;
  checkedOutAt: string | null;
  hospitality: boolean;
  firstVisit: boolean;
  needsConsultation: boolean;
  payment: PaymentState;
  /** Required consent forms not signed at the current version. */
  consentMissing: number;
  healthProfileMissing: boolean;
  /** First appointment of the visit (specialist discounts hang off it). */
  appointmentId: string;
  /** That appointment's price, same basis as invoice entry (VAT-inclusive when prices include VAT). */
  priceMinor: number;
  discount: { status: string; amountMinor: number; pctBp: number; reason: string } | null;
  /** Invoice issued — discounts can no longer change. */
  invoiceIssued: boolean;
}

export interface BoardRoom {
  id: string;
  name: string;
  nameAr: string | null;
  state: "free" | "occupied" | "preparing";
  /** Occupied: who and until when; preparing: since when. */
  clientName?: string;
  until?: string;
  since?: string;
}

export interface Board {
  dateISO: string;
  now: string;
  settings: JourneySettings;
  cards: BoardCard[];
  rooms: BoardRoom[];
}

export async function getBoard(now: Date = new Date(), opts: { staffUserId?: string } = {}): Promise<Board> {
  const settings = await getJourneySettings();
  const dateISO = utcToCenterLocal(now).dateISO;
  const dayStart = centerLocalToUtc(dateISO, 0);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const bookings = await prisma.booking.findMany({
    where: {
      status: { in: ["REQUESTED", "CONFIRMED", "CHECKED_IN", "COMPLETED"] },
      appointments: { some: { startAt: { gte: dayStart, lt: dayEnd }, ...(opts.staffUserId ? { staffUserId: opts.staffUserId } : {}) } },
    },
    include: {
      checkIn: true,
      client: { select: { id: true, fullName: true, user: { select: { phone: true } } } },
      appointments: {
        orderBy: { startAt: "asc" },
        include: {
          service: { select: { nameEn: true, nameAr: true, durationMin: true, needsConsultation: true, payBeforeTreatment: true } },
          room: { select: { name: true, nameAr: true } },
          staff: { select: { staffProfile: { select: { fullName: true, fullNameAr: true } } } },
          discount: { select: { status: true, amountMinor: true, pctBp: true, reason: true } },
        },
      },
    },
  });
  // Completed today without a journey record (closed straight from the calendar) aren't on the board.
  const visible = bookings.filter((b) => b.status !== "COMPLETED" || b.checkIn);

  const clientIds = [...new Set(visible.map((b) => b.clientProfileId))];
  const receiverIds = [...new Set(visible.map((b) => b.checkIn?.receivedById).filter((x): x is string => !!x))];
  const [priorCompleted, intakes, receivers, invoices, consentForms, signatures] = await Promise.all([
    prisma.booking.groupBy({ by: ["clientProfileId"], where: { clientProfileId: { in: clientIds }, status: "COMPLETED", appointments: { some: { startAt: { lt: dayStart } } } }, _count: true }),
    prisma.medicalIntake.groupBy({ by: ["clientProfileId"], where: { clientProfileId: { in: clientIds } }, _count: true }),
    prisma.staffProfile.findMany({ where: { userId: { in: receiverIds } }, select: { userId: true, fullName: true } }),
    prisma.invoice.findMany({ where: { bookingId: { in: visible.map((b) => b.id) }, kind: "INVOICE", status: { not: "VOID" } }, select: { id: true, bookingId: true, status: true }, orderBy: { createdAt: "asc" } }),
    prisma.consentForm.findMany({ where: { isActive: true }, select: { id: true, key: true, version: true, serviceIds: true } }),
    prisma.consentSignature.findMany({ where: { clientProfileId: { in: clientIds } }, select: { clientProfileId: true, consentFormId: true, formVersion: true } }),
  ]);
  const returning = new Set(priorCompleted.map((r) => r.clientProfileId));
  const hasIntake = new Set(intakes.map((r) => r.clientProfileId));
  const receiverName = new Map(receivers.map((r) => [r.userId, r.fullName]));
  const invoiceByBooking = new Map(invoices.map((i) => [i.bookingId!, i]));

  const cards: BoardCard[] = visible.map((b) => {
    const a = b.appointments[0]!;
    const visit = b.checkIn;
    const column: BoardColumn = visit ? visit.stage : "EXPECTED";
    const serviceIds = b.appointments.map((x) => x.serviceId);
    const consentMissing = consentForms.filter((f) => {
      const needed = f.key === CONSENT_KEYS.GENERAL || f.serviceIds.some((id) => serviceIds.includes(id));
      return needed && !signatures.some((s) => s.clientProfileId === b.clientProfileId && s.consentFormId === f.id && s.formVersion === f.version);
    }).length;
    const inv = invoiceByBooking.get(b.id);
    return {
      bookingId: b.id,
      clientProfileId: b.clientProfileId,
      clientName: b.client.fullName?.trim() || "Customer",
      phone: b.client.user?.phone ?? null,
      serviceName: a.service.nameEn,
      serviceNameAr: a.service.nameAr || null,
      staffUserId: a.staffUserId,
      staffName: a.staff.staffProfile?.fullName ?? "",
      staffNameAr: a.staff.staffProfile?.fullNameAr ?? null,
      roomId: a.roomId,
      roomName: a.room.name,
      roomNameAr: a.room.nameAr ?? null,
      startAt: a.startAt.toISOString(),
      endAt: b.appointments[b.appointments.length - 1]!.endAt.toISOString(),
      durationMin: b.appointments.reduce((n, x) => n + x.service.durationMin, 0),
      column,
      since: (visit ? visit.stageAt : a.startAt).toISOString(),
      arrivedAt: visit?.arrivedAt.toISOString() ?? null,
      receivedAt: visit?.receivedAt?.toISOString() ?? null,
      receivedByName: visit?.receivedById ? receiverName.get(visit.receivedById) ?? null : null,
      seatedAt: visit?.seatedAt?.toISOString() ?? null,
      treatmentEndedAt: visit?.treatmentEndedAt?.toISOString() ?? null,
      checkedOutAt: visit?.checkedOutAt?.toISOString() ?? null,
      hospitality: Boolean(visit?.hospitalityAt),
      firstVisit: !returning.has(b.clientProfileId),
      needsConsultation: b.appointments.some((x) => x.service.needsConsultation) || !returning.has(b.clientProfileId),
      payment: {
        required: b.appointments.some((x) => x.service.payBeforeTreatment),
        paid: inv?.status === "PAID",
        overridden: Boolean(visit?.paymentOverrideById),
        invoiceId: inv?.id ?? null,
      },
      consentMissing,
      healthProfileMissing: !hasIntake.has(b.clientProfileId),
      appointmentId: a.id,
      priceMinor: a.priceMinorSnapshot,
      discount: a.discount && a.discount.status !== "DECLINED" ? a.discount : null,
      invoiceIssued: !!inv && inv.status !== "DRAFT",
    };
  });
  cards.sort((x, y) => x.since.localeCompare(y.since));

  const rooms = await prisma.room.findMany({ where: { isActive: true }, orderBy: { order: "asc" }, select: { id: true, name: true, nameAr: true, preparingSince: true } });
  const occupied = new Map(cards.filter((c) => c.column === "TREATMENT" || c.column === "CONSULTATION").map((c) => [c.roomId, c]));
  const boardRooms: BoardRoom[] = rooms.map((r) => {
    const occ = occupied.get(r.id);
    if (occ) return { id: r.id, name: r.name, nameAr: r.nameAr, state: "occupied", clientName: occ.clientName, until: occ.endAt };
    const prepEnds = r.preparingSince ? r.preparingSince.getTime() + settings.roomPrepareMin * 60_000 : 0;
    if (r.preparingSince && prepEnds > now.getTime()) return { id: r.id, name: r.name, nameAr: r.nameAr, state: "preparing", since: r.preparingSince.toISOString() };
    return { id: r.id, name: r.name, nameAr: r.nameAr, state: "free" };
  });

  return { dateISO, now: now.toISOString(), settings, cards, rooms: boardRooms };
}

/** My customers waiting for me right now (arrival alerts). */
export async function waitingForStaff(staffUserId: string): Promise<{ bookingId: string; clientName: string; arrivedAt: string }[]> {
  const rows = await prisma.checkIn.findMany({
    where: { stage: "WAITING", booking: { status: "CHECKED_IN", appointments: { some: { staffUserId } } }, arrivedAt: { gte: new Date(Date.now() - 12 * 3_600_000) } },
    select: { bookingId: true, arrivedAt: true, booking: { select: { client: { select: { fullName: true } } } } },
    orderBy: { arrivedAt: "asc" },
  });
  return rows.map((r) => ({ bookingId: r.bookingId, clientName: r.booking.client.fullName?.trim() || "Customer", arrivedAt: r.arrivedAt.toISOString() }));
}

// ---- Timeline + metrics -------------------------------------------------------------

export interface TimelineEntry {
  kind: string;
  stage: VisitStage;
  at: Date;
  byName: string | null;
  note: string | null;
}

export async function visitTimeline(bookingId: string, opts: { arabic?: boolean } = {}): Promise<TimelineEntry[]> {
  const visit = await prisma.checkIn.findUnique({ where: { bookingId }, select: { events: { orderBy: { at: "asc" } } } });
  if (!visit) return [];
  const ids = [...new Set(visit.events.flatMap((e) => [e.byUserId, e.kind === "reassigned" ? e.note : null]).filter((x): x is string => !!x))];
  const names = new Map((await prisma.staffProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, fullName: true, fullNameAr: true } })).map((p) => [p.userId, (opts.arabic && p.fullNameAr?.trim()) || p.fullName]));
  return visit.events.map((e) => ({
    kind: e.kind,
    stage: e.stage,
    at: e.at,
    byName: e.byUserId ? names.get(e.byUserId) ?? null : null,
    note: e.kind === "reassigned" && e.note ? names.get(e.note) ?? null : e.note,
  }));
}

const mins = (a: Date | null, b: Date | null) => (a && b ? Math.max(0, (b.getTime() - a.getTime()) / 60_000) : null);

/** The minutes behind every visit metric, for one visit. */
export function visitDurations(v: Pick<CheckIn, "arrivedAt" | "receivedAt" | "seatedAt" | "treatmentEndedAt" | "checkedOutAt">, plannedMin: number) {
  const treatment = mins(v.seatedAt, v.treatmentEndedAt);
  return {
    waitMin: mins(v.arrivedAt, v.receivedAt ?? v.seatedAt),
    treatmentMin: treatment,
    overrunMin: treatment === null ? null : Math.max(0, treatment - plannedMin),
    checkoutMin: mins(v.treatmentEndedAt, v.checkedOutAt),
    totalMin: mins(v.arrivedAt, v.checkedOutAt),
  };
}

export interface FlowMetrics {
  visits: number;
  avgWaitMin: number | null;
  maxWaitMin: number | null;
  /** Share of customers received within the amber threshold. */
  seenOnTimePct: number | null;
  avgOverrunMin: number | null;
  avgCheckoutMin: number | null;
  avgTotalMin: number | null;
  byStaff: { staffUserId: string; name: string; visits: number; avgWaitMin: number | null; avgOverrunMin: number | null }[];
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export async function flowMetrics(from: Date, to: Date): Promise<FlowMetrics> {
  const settings = await getJourneySettings();
  const visits = await prisma.checkIn.findMany({
    where: { arrivedAt: { gte: from, lt: to }, booking: { status: { in: ["CHECKED_IN", "COMPLETED"] } } },
    select: {
      arrivedAt: true, receivedAt: true, seatedAt: true, treatmentEndedAt: true, checkedOutAt: true,
      booking: { select: { appointments: { select: { staffUserId: true, service: { select: { durationMin: true } }, staff: { select: { staffProfile: { select: { fullName: true } } } } } } } },
    },
  });
  const rows = visits.map((v) => {
    const planned = v.booking.appointments.reduce((n, a) => n + a.service.durationMin, 0);
    const a = v.booking.appointments[0];
    return { ...visitDurations(v, planned), staffUserId: a?.staffUserId ?? "", name: a?.staff.staffProfile?.fullName ?? "" };
  });
  const waits = rows.map((r) => r.waitMin).filter((x): x is number => x !== null);
  const overruns = rows.map((r) => r.overrunMin).filter((x): x is number => x !== null);
  const byStaff = new Map<string, typeof rows>();
  for (const r of rows) byStaff.set(r.staffUserId, [...(byStaff.get(r.staffUserId) ?? []), r]);
  return {
    visits: rows.length,
    avgWaitMin: avg(waits),
    maxWaitMin: waits.length ? Math.round(Math.max(...waits)) : null,
    seenOnTimePct: waits.length ? Math.round((waits.filter((w) => w <= settings.waitAmberMin).length / waits.length) * 100) : null,
    avgOverrunMin: avg(overruns),
    avgCheckoutMin: avg(rows.map((r) => r.checkoutMin).filter((x): x is number => x !== null)),
    avgTotalMin: avg(rows.map((r) => r.totalMin).filter((x): x is number => x !== null)),
    byStaff: [...byStaff.entries()]
      .map(([staffUserId, rs]) => ({
        staffUserId,
        name: rs[0]!.name,
        visits: rs.length,
        avgWaitMin: avg(rs.map((r) => r.waitMin).filter((x): x is number => x !== null)),
        avgOverrunMin: avg(rs.map((r) => r.overrunMin).filter((x): x is number => x !== null)),
      }))
      .sort((a, b) => b.visits - a.visits),
  };
}
