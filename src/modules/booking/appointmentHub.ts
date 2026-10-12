// The Appointment Hub read model: everything about one appointment (and the
// visit it belongs to) assembled in one batched read, so the hub page can
// render the whole picture — the visit, the customer, the Rechnung (invoice)
// and what was bought, the treatment record, documents, comments and the
// customer's visit history — without a client-side waterfall.
//
// An Appointment belongs to a Booking (a "visit"); a visit can hold more than
// one appointment (one per service). The invoice and comments hang off the
// booking, the treatment record off the individual appointment — so the hub
// is keyed by appointment but pulls in the whole visit around it. No new
// columns: every link here already exists in the schema (some as soft string
// references), it just was never assembled in one place before.

import { prisma } from "@/lib/db";
import type { Booking, BookingStatus } from "@prisma/client";
import { asProducts } from "@/modules/clinical/treatments";

export interface HubLineItem {
  description: string;
  kind: string;
  qty: number;
  unitPriceMinor: number;
  totalMinor: number;
}

export interface HubInvoice {
  id: string;
  number: string;
  kind: string;
  status: string;
  issuedAt: Date | null;
  createdAt: Date;
  subtotalMinor: number;
  discountMinor: number;
  vatMinor: number;
  totalMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  lines: HubLineItem[];
}

export interface HubTreatment {
  id: string;
  appointmentId: string | null;
  serviceName: string | null;
  performedByName: string;
  performedAt: Date;
  notes: string | null;
  skinReaction: string | null;
  followUpAt: Date | null;
  products: { name: string; qty: string; unit: string }[];
  photoCount: number;
}

export interface HubSiblingAppointment {
  appointmentId: string;
  serviceName: string;
  staffName: string;
  roomName: string;
  startAt: Date;
  endAt: Date;
  priceMinor: number;
  treatmentRecordId: string | null;
  isCurrent: boolean;
}

export interface HubPhoto {
  id: string;
  kind: string;
  area: string | null;
  note: string | null;
  takenAt: Date;
}

export interface HubDocument {
  id: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  category: string;
  note: string | null;
  createdAt: Date;
}

export interface HubComment {
  id: string;
  body: string;
  authorName?: string;
  authorUserId: string;
  createdAt: Date;
  pinned: boolean;
}

export interface HubHistoryVisit {
  bookingId: string;
  appointmentId: string;
  serviceName: string;
  startAt: Date;
  status: BookingStatus;
  isCurrent: boolean;
}

export interface AppointmentHub {
  appointmentId: string;
  booking: {
    id: string;
    status: BookingStatus;
    channel: Booking["channel"];
    sourceChannel: string | null;
    notes: string | null;
    centerNote: string | null;
    customerNote: string | null;
    discountMinor: number;
    createdAt: Date;
  };
  appointment: {
    serviceId: string;
    serviceName: string;
    staffUserId: string;
    staffName: string;
    roomName: string;
    startAt: Date;
    endAt: Date;
    priceMinor: number;
    durationMin: number;
  };
  checkIn: { arrivedAt: Date; seatedAt: Date | null } | null;
  client: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    tierName: string | null;
    tags: string[];
    allergies: string | null;
    skinType: string | null;
    consentTreatmentAt: Date | null;
    consentDataAt: Date | null;
    ltvMinor: number;
  };
  siblings: HubSiblingAppointment[];
  invoice: HubInvoice | null;
  treatmentRecord: HubTreatment | null;
  photos: HubPhoto[];
  documents: HubDocument[];
  comments: HubComment[];
  history: HubHistoryVisit[];
  stats: { completedVisits: number; totalBookings: number; lastVisitAt: Date | null };
}

/** The appointment a booking's hub links to: its earliest-starting one. */
export async function primaryAppointmentId(bookingId: string): Promise<string | null> {
  const appt = await prisma.appointment.findFirst({
    where: { bookingId },
    orderBy: { startAt: "asc" },
    select: { id: true },
  });
  return appt?.id ?? null;
}

// Assembles the full hub for one appointment. Returns null when the
// appointment doesn't exist. Reads are batched: one query for the appointment
// + booking + client, then a fixed set of parallel lookups for the rest.
export async function getAppointmentHub(appointmentId: string): Promise<AppointmentHub | null> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      service: { select: { nameEn: true, durationMin: true } },
      booking: {
        include: {
          client: { include: { user: { select: { phone: true, email: true } }, membership: { include: { tier: { select: { name: true } } } } } },
          appointments: { include: { service: { select: { nameEn: true } } }, orderBy: { startAt: "asc" } },
          checkIn: true,
        },
      },
    },
  });
  if (!appt) return null;

  const booking = appt.booking;
  const client = booking.client;
  const clientProfileId = booking.clientProfileId;

  const siblingIds = booking.appointments.map((a) => a.id);
  const staffIds = [...new Set(booking.appointments.map((a) => a.staffUserId))];
  const roomIds = [...new Set(booking.appointments.map((a) => a.roomId))];

  const [staff, rooms, invoiceRow, treatments, notes, otherBookings, documents] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, staffProfile: { select: { fullName: true } } } }),
    prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, name: true } }),
    // The visit's live (non-void) invoice, with lines and payments.
    prisma.invoice.findFirst({
      where: { bookingId: booking.id, kind: "INVOICE", status: { not: "VOID" } },
      orderBy: { createdAt: "desc" },
      include: { lines: { orderBy: { sortOrder: "asc" } }, payments: { select: { amountMinor: true, status: true } } },
    }),
    // Treatment records across every appointment in this visit.
    prisma.treatmentRecord.findMany({
      where: { appointmentId: { in: siblingIds } },
      include: { _count: { select: { photos: true } } },
    }),
    // Comments scoped to this visit (VisitNote.bookingId — stored all along,
    // surfaced here for the first time).
    prisma.visitNote.findMany({
      where: { clientProfileId, bookingId: booking.id },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    }),
    // Visit history: the customer's other bookings (most recent first).
    prisma.booking.findMany({
      where: { clientProfileId },
      orderBy: { createdAt: "desc" },
      take: 24,
      include: { appointments: { orderBy: { startAt: "asc" }, include: { service: { select: { nameEn: true } } } } },
    }),
    // Documents attached to this visit (receipts, labs, forms, …).
    prisma.visitDocument.findMany({
      where: { bookingId: booking.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, mime: true, sizeBytes: true, category: true, note: true, createdAt: true },
    }),
  ]);

  const staffName = new Map(staff.map((s) => [s.id, s.staffProfile?.fullName ?? "Unknown staff"]));
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const treatmentByAppt = new Map(treatments.map((t) => [t.appointmentId, t]));

  // Names of the staff who performed treatments (soft ref), batched.
  const performerIds = [...new Set(treatments.map((t) => t.performedById))];
  const performers = performerIds.length
    ? await prisma.user.findMany({ where: { id: { in: performerIds } }, select: { id: true, email: true, staffProfile: { select: { fullName: true } } } })
    : [];
  const performerName = new Map(performers.map((p) => [p.id, p.staffProfile?.fullName ?? p.email ?? "Staff"]));

  // Service names for treatment records (soft ref), batched.
  const treatmentServiceIds = [...new Set(treatments.map((t) => t.serviceId).filter((v): v is string => Boolean(v)))];
  const treatmentServices = treatmentServiceIds.length
    ? await prisma.service.findMany({ where: { id: { in: treatmentServiceIds } }, select: { id: true, nameEn: true } })
    : [];
  const treatmentServiceName = new Map(treatmentServices.map((s) => [s.id, s.nameEn]));

  const toTreatment = (t: (typeof treatments)[number]): HubTreatment => ({
    id: t.id,
    appointmentId: t.appointmentId,
    serviceName: t.serviceId ? (treatmentServiceName.get(t.serviceId) ?? null) : null,
    performedByName: performerName.get(t.performedById) ?? "Staff",
    performedAt: t.performedAt,
    notes: t.notes,
    skinReaction: t.skinReaction,
    followUpAt: t.followUpAt,
    products: asProducts(t.productsUsed).map((p) => ({ name: p.name, qty: p.qty, unit: p.unit })),
    photoCount: t._count.photos,
  });

  // Documents: clinical photos attached to any of this visit's treatment
  // records. (Photos not tied to a record live on the customer profile.)
  const treatmentIds = treatments.map((t) => t.id);
  const photoRows = treatmentIds.length
    ? await prisma.clinicalPhoto.findMany({
        where: { treatmentRecordId: { in: treatmentIds } },
        orderBy: { takenAt: "desc" },
        select: { id: true, kind: true, area: true, note: true, takenAt: true },
      })
    : [];

  // Author names for comments, batched.
  const authorIds = [...new Set(notes.map((n) => n.authorUserId))];
  const authors = authorIds.length
    ? await prisma.user.findMany({ where: { id: { in: authorIds } }, include: { staffProfile: true, clientProfile: true } })
    : [];
  const authorName = new Map(authors.map((u) => [u.id, u.staffProfile?.fullName ?? u.clientProfile?.fullName]));

  const siblings: HubSiblingAppointment[] = booking.appointments.map((a) => ({
    appointmentId: a.id,
    serviceName: a.service.nameEn,
    staffName: staffName.get(a.staffUserId) ?? "Unknown staff",
    roomName: roomName.get(a.roomId) ?? "Unknown room",
    startAt: a.startAt,
    endAt: a.endAt,
    priceMinor: a.priceMinorSnapshot,
    treatmentRecordId: treatmentByAppt.get(a.id)?.id ?? null,
    isCurrent: a.id === appointmentId,
  }));

  const invoice: HubInvoice | null = invoiceRow
    ? {
        id: invoiceRow.id,
        number: invoiceRow.number,
        kind: invoiceRow.kind,
        status: invoiceRow.status,
        issuedAt: invoiceRow.issuedAt,
        createdAt: invoiceRow.createdAt,
        subtotalMinor: invoiceRow.subtotalMinor,
        discountMinor: invoiceRow.discountMinor,
        vatMinor: invoiceRow.vatMinor,
        totalMinor: invoiceRow.totalMinor,
        paidMinor: invoiceRow.paidMinor,
        outstandingMinor: Math.max(0, invoiceRow.totalMinor - invoiceRow.paidMinor),
        lines: invoiceRow.lines.map((l) => ({ description: l.description, kind: l.kind, qty: l.qty, unitPriceMinor: l.unitPriceMinor, totalMinor: l.totalMinor })),
      }
    : null;

  const history: HubHistoryVisit[] = otherBookings
    .map((b) => {
      const primary = b.appointments[0];
      if (!primary) return null;
      return {
        bookingId: b.id,
        appointmentId: primary.id,
        serviceName: b.appointments.map((a) => a.service.nameEn).join(", ") || "Visit",
        startAt: primary.startAt,
        status: b.status,
        isCurrent: b.id === booking.id,
      } satisfies HubHistoryVisit;
    })
    .filter((v): v is HubHistoryVisit => v !== null);

  const completedVisits = history.filter((h) => h.status === "COMPLETED").length;
  const lastVisitAt = history
    .filter((h) => h.status === "COMPLETED" && !h.isCurrent)
    .reduce<Date | null>((max, h) => (!max || h.startAt > max ? h.startAt : max), null);

  return {
    appointmentId,
    booking: {
      id: booking.id,
      status: booking.status,
      channel: booking.channel,
      sourceChannel: booking.sourceChannel,
      notes: booking.notes,
      centerNote: booking.centerNote,
      customerNote: booking.customerNote,
      discountMinor: booking.discountMinor,
      createdAt: booking.createdAt,
    },
    appointment: {
      serviceId: appt.serviceId,
      serviceName: appt.service.nameEn,
      staffUserId: appt.staffUserId,
      staffName: staffName.get(appt.staffUserId) ?? "Unknown staff",
      roomName: roomName.get(appt.roomId) ?? "Unknown room",
      startAt: appt.startAt,
      endAt: appt.endAt,
      priceMinor: appt.priceMinorSnapshot,
      durationMin: appt.service.durationMin,
    },
    checkIn: booking.checkIn ? { arrivedAt: booking.checkIn.arrivedAt, seatedAt: booking.checkIn.seatedAt } : null,
    client: {
      id: client.id,
      fullName: client.fullName,
      phone: client.user.phone,
      email: client.user.email,
      tierName: client.membership?.tier.name ?? null,
      tags: client.tags,
      allergies: client.allergies,
      skinType: client.skinType,
      consentTreatmentAt: client.consentTreatmentAt,
      consentDataAt: client.consentDataAt,
      ltvMinor: client.ltvCacheMinor,
    },
    siblings,
    invoice,
    treatmentRecord: treatmentByAppt.get(appointmentId) ? toTreatment(treatmentByAppt.get(appointmentId)!) : null,
    photos: photoRows.map((p) => ({ id: p.id, kind: p.kind, area: p.area, note: p.note, takenAt: p.takenAt })),
    documents,
    comments: notes.map((n) => ({ id: n.id, body: n.body, authorName: authorName.get(n.authorUserId) ?? undefined, authorUserId: n.authorUserId, createdAt: n.createdAt, pinned: n.pinned })),
    history,
    stats: { completedVisits, totalBookings: history.length, lastVisitAt },
  };
}
