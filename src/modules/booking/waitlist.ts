// Smart waitlist: a client (or walk-up contact) who wants a service on a day
// with no free slot can join the waitlist for that service+day. When a slot
// on that day frees up -- a cancel() or reschedule() in bookings.ts -- the
// oldest WAITING entries are notified via the existing outbox (no new
// worker: notifyWaitlistForSlot just calls scheduleMessage with sendAt=now,
// same as every other booking-lifecycle message).

import { z } from "zod";
import { prisma } from "@/lib/db";
import type { WaitlistEntry, WaitlistStatus } from "@prisma/client";
import { scheduleMessage } from "./outbox";
import { localized } from "@/modules/catalog/localize";
import { utcToCenterLocal } from "./availability";

const DATE_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Same "starts with ar" normalization bookings.ts's toLocale and outbox.ts's
// renderMessageBody use, kept local here since it's a one-line rule, not
// worth sharing across modules for.
function toLocale(locale: string): "en" | "ar" {
  return locale.toLowerCase().startsWith("ar") ? "ar" : "en";
}

const joinWaitlistSchema = z
  .object({
    serviceId: z.string().min(1),
    desiredDateISO: z.string().regex(DATE_ISO_PATTERN, "Invalid date"),
    desiredWindow: z.string().min(1).max(50).optional(),
    clientProfileId: z.string().min(1).optional(),
    // Walk-up contact fallback, used when clientProfileId is absent (the
    // public join form and admin walk-up add don't require OTP verification
    // the way the booking wizard does).
    name: z.string().min(1).max(200).optional(),
    phone: z.string().min(1).optional(),
    email: z.string().email().optional(),
    locale: z.string().min(1).default("ar"),
  })
  // Needs at least one way to identify/reach the person: either an existing
  // client profile, or a phone/email to notify later.
  .refine((v) => Boolean(v.clientProfileId || v.phone || v.email), {
    message: "joinWaitlist requires a clientProfileId or a phone/email contact",
  });
export type JoinWaitlistInput = z.input<typeof joinWaitlistSchema>;

/** Records a WAITING waitlist entry for `serviceId` on `desiredDateISO` (center-local). */
export async function joinWaitlist(input: JoinWaitlistInput): Promise<WaitlistEntry> {
  const data = joinWaitlistSchema.parse(input);

  const service = await prisma.service.findUnique({ where: { id: data.serviceId } });
  if (!service) {
    throw new Error(`Service "${data.serviceId}" not found`);
  }

  return prisma.waitlistEntry.create({
    data: {
      serviceId: data.serviceId,
      clientProfileId: data.clientProfileId ?? null,
      name: data.name ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      locale: toLocale(data.locale),
      desiredDateISO: data.desiredDateISO,
      desiredWindow: data.desiredWindow ?? null,
      status: "WAITING",
    },
  });
}

// Bounded so a single freed slot never fans out to an unbounded number of
// WAITLIST_OPEN messages -- only the first N (oldest-first) WAITING entries
// for that service+day get notified about this particular opening.
export const WAITLIST_NOTIFY_LIMIT = 3;

interface Recipient {
  toPhone?: string;
  toEmail?: string;
  locale: string;
}

// Resolves who/how to notify for one entry: a signed-in client's contact
// info comes from their User row (phone/email/locale), since the entry
// itself only carries clientProfileId in that case; a walk-up entry carries
// its own phone/email/locale directly. Returns null when there is no usable
// recipient at all (defensive -- joinWaitlist's schema already requires one
// of these, but data can outlive that guarantee, e.g. a client removing
// their phone/email later).
async function resolveRecipient(entry: WaitlistEntry): Promise<Recipient | null> {
  if (entry.clientProfileId) {
    const client = await prisma.clientProfile.findUnique({
      where: { id: entry.clientProfileId },
      include: { user: true },
    });
    if (!client) return null;
    const toPhone = client.user.phone ?? undefined;
    const toEmail = client.user.email ?? undefined;
    if (!toPhone && !toEmail) return null;
    return { toPhone, toEmail, locale: client.user.locale };
  }

  const toPhone = entry.phone ?? undefined;
  const toEmail = entry.email ?? undefined;
  if (!toPhone && !toEmail) return null;
  return { toPhone, toEmail, locale: entry.locale };
}

/**
 * Called after a slot frees up for `serviceId` on `dateISO` (center-local) --
 * i.e. from cancel()/reschedule() in bookings.ts. Finds the oldest WAITING
 * entries for that exact service+day (bounded to `opts.limit`, default
 * WAITLIST_NOTIFY_LIMIT), schedules a WAITLIST_OPEN message for each
 * (through the existing outbox -- sendAt=now, no new worker), and flips them
 * to NOTIFIED. Best-effort per entry: a failure notifying one entry (e.g. a
 * stale clientProfileId) is logged and skipped rather than aborting the
 * rest of the batch. Returns the number of entries actually notified.
 */
export async function notifyWaitlistForSlot(
  serviceId: string,
  dateISO: string,
  opts: { limit?: number } = {},
): Promise<number> {
  const limit = opts.limit ?? WAITLIST_NOTIFY_LIMIT;

  const entries = await prisma.waitlistEntry.findMany({
    where: { serviceId, desiredDateISO: dateISO, status: "WAITING" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  if (entries.length === 0) return 0;

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) return 0;

  let notifiedCount = 0;
  for (const entry of entries) {
    try {
      const recipient = await resolveRecipient(entry);
      if (!recipient) continue;

      await scheduleMessage({
        kind: "WAITLIST_OPEN",
        clientProfileId: entry.clientProfileId ?? undefined,
        toPhone: recipient.toPhone,
        toEmail: recipient.toEmail,
        locale: recipient.locale,
        sendAt: new Date(),
        payload: {
          serviceId,
          serviceName: localized(toLocale(recipient.locale), service.nameEn, service.nameAr),
          desiredDateISO: entry.desiredDateISO,
        },
      });

      await prisma.waitlistEntry.update({
        where: { id: entry.id },
        data: { status: "NOTIFIED", notifiedAt: new Date() },
      });
      notifiedCount += 1;
    } catch (err) {
      console.error(`[waitlist] failed to notify entry "${entry.id}" for service "${serviceId}" on "${dateISO}"`, err);
    }
  }
  return notifiedCount;
}

export interface WaitlistFilter {
  serviceId?: string;
  status?: WaitlistStatus;
}

export type WaitlistEntryWithRelations = WaitlistEntry & {
  service: { nameEn: string; nameAr: string };
  clientProfile: { fullName: string; user: { phone: string | null; email: string | null } } | null;
};

/** Lists waitlist entries for the admin view, newest-first, optionally narrowed by service/status. */
export async function listWaitlist(filter: WaitlistFilter = {}): Promise<WaitlistEntryWithRelations[]> {
  return prisma.waitlistEntry.findMany({
    where: {
      ...(filter.serviceId ? { serviceId: filter.serviceId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    include: {
      service: { select: { nameEn: true, nameAr: true } },
      clientProfile: { select: { fullName: true, user: { select: { phone: true, email: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Marks every WAITING entry whose desiredDateISO has already passed (before
 * `todayISO`, center-local) as EXPIRED. Not wired into any lifecycle hook --
 * intended for an occasional maintenance call (e.g. a cron/admin action) so
 * stale entries stop showing as actionable. Returns the number expired.
 */
export async function expireStale(todayISO: string = utcToCenterLocal(new Date()).dateISO): Promise<number> {
  const { count } = await prisma.waitlistEntry.updateMany({
    where: { status: "WAITING", desiredDateISO: { lt: todayISO } },
    data: { status: "EXPIRED" },
  });
  return count;
}
