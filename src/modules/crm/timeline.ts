// DB half of the customer timeline: batches every source for one customer
// (each capped) and hands the rows to assembleTimeline (timelineCore.ts).

import { prisma } from "@/lib/db";
import { assembleTimeline, type TimelineEntry } from "./timelineCore";

export * from "./timelineCore";

// --- DB loader ----------------------------------------------------------------

export interface LoadTimelineOptions {
  /** billing:manage — include invoices and payments. */
  includeBilling?: boolean;
  /** clinical:manage — include consents, treatment records and photos. */
  includeClinical?: boolean;
  /** Per-source cap so a very active customer stays fast. */
  perSourceLimit?: number;
}

const CENTER_OFFSET_MS = 3 * 60 * 60 * 1000;
const dateISOFor = (d: Date) => new Date(d.getTime() + CENTER_OFFSET_MS).toISOString().slice(0, 10);

/** Loads every source for one customer (each capped) and merges them. */
export async function loadCustomerTimeline(clientProfileId: string, opts: LoadTimelineOptions = {}): Promise<TimelineEntry[]> {
  const take = Math.min(Math.max(opts.perSourceLimit ?? 100, 1), 500);
  const none = <T>(): Promise<T[]> => Promise.resolve([]);

  const [bookings, invoices, packages, giftCards, loyalty, chats, callbacks, conversations, inquiries, notes, activities, consents, treatments, photos, reviews, waitlist] =
    await Promise.all([
      prisma.booking.findMany({
        where: { clientProfileId },
        orderBy: { createdAt: "desc" },
        take,
        include: { appointments: { include: { service: { select: { nameEn: true } }, staff: { select: { staffProfile: { select: { fullName: true } } } } } } },
      }),
      opts.includeBilling
        ? prisma.invoice.findMany({ where: { clientProfileId }, orderBy: { createdAt: "desc" }, take, include: { payments: true } })
        : none<never>(),
      prisma.packagePurchase.findMany({ where: { clientProfileId }, orderBy: { createdAt: "desc" }, take, include: { package: true, redemptions: true } }),
      prisma.giftCard.findMany({ where: { issuedToClientId: clientProfileId }, orderBy: { createdAt: "desc" }, take, include: { redemptions: true } }),
      prisma.loyaltyTransaction.findMany({ where: { clientProfileId }, orderBy: { createdAt: "desc" }, take }),
      prisma.chatSession.findMany({ where: { clientProfileId }, orderBy: { createdAt: "desc" }, take, select: { id: true, outcome: true, createdAt: true, profile: true } }),
      prisma.callbackRequest.findMany({ where: { clientProfileId }, orderBy: { createdAt: "desc" }, take }),
      prisma.whatsappConversation.findMany({
        where: { clientProfileId },
        include: { messages: { orderBy: { createdAt: "desc" }, take } },
      }),
      prisma.contactInquiry.findMany({ where: { clientProfileId }, orderBy: { createdAt: "desc" }, take }),
      prisma.visitNote.findMany({ where: { clientProfileId }, orderBy: { createdAt: "desc" }, take }),
      prisma.leadActivity.findMany({ where: { clientProfileId }, orderBy: { createdAt: "desc" }, take }),
      opts.includeClinical
        ? prisma.consentSignature.findMany({ where: { clientProfileId }, orderBy: { signedAt: "desc" }, take, include: { consentForm: { select: { titleEn: true } } } })
        : none<never>(),
      opts.includeClinical
        ? prisma.treatmentRecord.findMany({ where: { clientProfileId }, orderBy: { performedAt: "desc" }, take })
        : none<never>(),
      opts.includeClinical
        ? prisma.clinicalPhoto.findMany({ where: { clientProfileId }, orderBy: { takenAt: "desc" }, take, select: { id: true, kind: true, area: true, takenAt: true } })
        : none<never>(),
      prisma.review.findMany({ where: { clientProfileId }, orderBy: { createdAt: "desc" }, take }),
      prisma.waitlistEntry.findMany({ where: { clientProfileId }, orderBy: { createdAt: "desc" }, take, include: { service: { select: { nameEn: true } } } }),
    ]);

  // Author + performer names in one batched lookup.
  const staffIds = [
    ...new Set([
      ...notes.map((n) => n.authorUserId),
      ...activities.map((a) => a.authorUserId),
      ...treatments.map((t) => t.performedById),
    ]),
  ];
  const staff = staffIds.length
    ? await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, email: true, staffProfile: { select: { fullName: true } } } })
    : [];
  const nameOf = new Map(staff.map((s) => [s.id, s.staffProfile?.fullName || s.email || "Staff"]));

  const treatmentServiceIds = [...new Set(treatments.map((t) => t.serviceId).filter((v): v is string => !!v))];
  const services = treatmentServiceIds.length
    ? await prisma.service.findMany({ where: { id: { in: treatmentServiceIds } }, select: { id: true, nameEn: true } })
    : [];
  const serviceName = new Map(services.map((s) => [s.id, s.nameEn]));

  return assembleTimeline({
    clientProfileId,
    bookings: bookings.map((b) => {
      const a = b.appointments[0];
      const startAt = a?.startAt ?? b.createdAt;
      return {
        id: b.id,
        startAt,
        status: b.status,
        serviceName: a?.service.nameEn ?? "Booking",
        staffName: a?.staff.staffProfile?.fullName ?? null,
        dateISO: dateISOFor(startAt),
      };
    }),
    invoices: invoices.map((i) => ({ id: i.id, number: i.number, kind: i.kind, status: i.status, totalMinor: i.totalMinor, paidMinor: i.paidMinor, issuedAt: i.issuedAt, createdAt: i.createdAt })),
    payments: invoices.flatMap((i) => i.payments.map((p) => ({ id: p.id, invoiceId: i.id, invoiceNumber: i.number, amountMinor: p.amountMinor, method: p.method, receivedAt: p.receivedAt }))),
    packages: packages.map((p) => ({ id: p.id, packageName: p.package.nameEn, sessionsRemaining: p.sessionsRemaining, sessionsTotal: p.package.sessionsTotal, createdAt: p.createdAt, redemptions: p.redemptions })),
    giftCards: giftCards.map((g) => ({ id: g.id, code: g.code, initialMinor: g.initialMinor, balanceMinor: g.balanceMinor, createdAt: g.createdAt, redemptions: g.redemptions })),
    loyalty,
    chats: chats.map((c) => {
      const profile = (c.profile ?? {}) as { concerns?: unknown };
      return { id: c.id, outcome: c.outcome, createdAt: c.createdAt, concerns: Array.isArray(profile.concerns) ? profile.concerns.map(String) : [] };
    }),
    callbacks,
    whatsapp: conversations.flatMap((c) => c.messages.map((m) => ({ id: m.id, conversationId: c.id, direction: m.direction, body: m.body, createdAt: m.createdAt }))),
    inquiries,
    notes: notes.map((n) => ({ ...n, authorName: nameOf.get(n.authorUserId) })),
    leadActivities: activities.map((a) => ({ ...a, authorName: nameOf.get(a.authorUserId) })),
    consents: consents.map((s) => ({ id: s.id, title: s.consentForm.titleEn, version: s.formVersion, signedAt: s.signedAt })),
    treatments: treatments.map((t) => ({ id: t.id, serviceName: t.serviceId ? (serviceName.get(t.serviceId) ?? null) : null, performedByName: nameOf.get(t.performedById) ?? "Staff", performedAt: t.performedAt, skinReaction: t.skinReaction })),
    photos,
    reviews,
    waitlist: waitlist.map((w) => ({ id: w.id, serviceName: w.service.nameEn, desiredDateISO: w.desiredDateISO, status: w.status, createdAt: w.createdAt })),
  });
}
