// Call-back requests: created from the website assistant (or by staff), worked
// from the /admin/callbacks queue. Each call attempt is logged on the
// customer's timeline as a CALL activity; "no answer" keeps the request open
// and schedules the next attempt inside opening hours.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSetting } from "@/modules/cms/settings";
import { scheduleMessage } from "@/modules/booking/outbox";
import { logActivity } from "@/modules/crm/leads";
import { utcToCenterLocal } from "@/modules/booking/availability";
import { callbackDueAt, nextAttemptAt } from "./hours";
import { findOrCreateLeadByPhone } from "./leads";
import { normalizePhone } from "./phone";
import { asLocale, copy, formatClock } from "./copy";
import { CALLBACK_WINDOWS, type CallbackWindow } from "./types";

export const CALLBACK_SOURCES = ["CHAT", "WEBSITE", "WHATSAPP", "STAFF"] as const;
export const OPEN_CALLBACK_STATUSES = ["OPEN", "NO_ANSWER"] as const;

export const CALLBACK_OUTCOMES = ["REACHED", "BOOKED", "NO_ANSWER", "WRONG_NUMBER", "NOT_INTERESTED"] as const;
export type CallbackOutcome = (typeof CALLBACK_OUTCOMES)[number];

export const CALLBACK_OUTCOME_LABELS: Record<CallbackOutcome, string> = {
  REACHED: "Reached",
  BOOKED: "Booked",
  NO_ANSWER: "No answer",
  WRONG_NUMBER: "Wrong number",
  NOT_INTERESTED: "Not interested",
};

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(6).max(40),
  locale: z.enum(["ar", "en"]).default("ar"),
  preferredWindow: z.enum(CALLBACK_WINDOWS).default("asap"),
  topic: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  source: z.enum(CALLBACK_SOURCES).default("CHAT"),
  chatSessionId: z.string().min(1).optional(),
  clientProfileId: z.string().min(1).optional(),
  /** Send the CALLBACK_ACK message to the customer (on for self-service requests). */
  acknowledge: z.boolean().default(true),
});
export type CreateCallbackInput = z.input<typeof createSchema>;

/** "today at around 4:00 PM" style phrase in the customer's language. */
export function describeDueForCustomer(due: Date, now: Date, locale: "ar" | "en"): string {
  const c = copy(locale);
  if (due.getTime() - now.getTime() < 15 * 60_000) return c.cbWhenSoon;
  const local = utcToCenterLocal(due);
  const today = utcToCenterLocal(now).dateISO;
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const day =
    local.dateISO === today
      ? c.today
      : local.dateISO === tomorrow.toISOString().slice(0, 10)
        ? c.tomorrow
        : new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(`${local.dateISO}T12:00:00Z`));
  const hh = String(Math.floor(local.minutes / 60)).padStart(2, "0");
  const mm = String(local.minutes % 60).padStart(2, "0");
  return c.cbWhenAt(day, formatClock(`${hh}:${mm}`, locale));
}

export async function createCallbackRequest(input: CreateCallbackInput, now: Date = new Date()) {
  const data = createSchema.parse(input);
  const phone = normalizePhone(data.phone);
  if (!phone) throw new Error("Invalid phone number");

  const clientProfileId =
    data.clientProfileId ??
    (await findOrCreateLeadByPhone({ phone, name: data.name, sourceChannel: data.source === "STAFF" ? "phone" : "chat" })).clientProfileId;

  const hours = await getSetting("hours").catch(() => null);
  const dueAt = callbackDueAt(hours, data.preferredWindow as CallbackWindow, now);

  const row = await prisma.callbackRequest.create({
    data: {
      name: data.name,
      phone,
      locale: data.locale,
      preferredWindow: data.preferredWindow,
      topic: data.topic || null,
      notes: data.notes || null,
      source: data.source,
      chatSessionId: data.chatSessionId ?? null,
      clientProfileId,
      status: "OPEN",
      dueAt,
    },
  });

  if (data.acknowledge) {
    // Best-effort: the request is saved whether or not the message queues.
    try {
      await scheduleMessage({
        kind: "CALLBACK_ACK",
        toPhone: phone,
        clientProfileId,
        locale: data.locale,
        sendAt: now,
        payload: {
          callbackId: row.id,
          name: data.name.split(/\s+/)[0] ?? data.name,
          when: describeDueForCustomer(dueAt, now, asLocale(data.locale)),
        },
      });
    } catch (err) {
      console.error("[callbacks] failed to queue CALLBACK_ACK", err);
    }
  }
  return row;
}

export type CallbackFilter = "open" | "done" | "all";

export interface CallbackRow {
  id: string;
  name: string;
  phone: string;
  locale: string;
  preferredWindow: string | null;
  topic: string | null;
  notes: string | null;
  source: string;
  status: string;
  attempts: number;
  outcome: string | null;
  dueAt: Date | null;
  createdAt: Date;
  handledAt: Date | null;
  clientProfileId: string | null;
  clientName: string | null;
  chatSessionId: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  handledByName: string | null;
}

async function staffNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, include: { staffProfile: true } });
  return new Map(users.map((u) => [u.id, u.staffProfile?.fullName ?? u.email ?? u.id]));
}

/** The queue: open requests first (most overdue on top), then handled ones. */
export async function listCallbacks(filter: CallbackFilter = "open", limit = 200): Promise<CallbackRow[]> {
  const where =
    filter === "open"
      ? { status: { in: [...OPEN_CALLBACK_STATUSES] } }
      : filter === "done"
        ? { status: { notIn: [...OPEN_CALLBACK_STATUSES] } }
        : {};
  const rows = await prisma.callbackRequest.findMany({
    where,
    include: { client: { select: { fullName: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });
  const names = await staffNames(rows.flatMap((r) => [r.assignedToId, r.handledById]));
  const isOpen = (s: string) => (OPEN_CALLBACK_STATUSES as readonly string[]).includes(s);
  const sorted = [...rows].sort((a, b) => {
    if (isOpen(a.status) !== isOpen(b.status)) return isOpen(a.status) ? -1 : 1;
    if (isOpen(a.status)) {
      if (a.status !== b.status) return a.status === "OPEN" ? -1 : 1;
      return (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0);
    }
    return (b.handledAt?.getTime() ?? b.updatedAt.getTime()) - (a.handledAt?.getTime() ?? a.updatedAt.getTime());
  });
  return sorted.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    locale: r.locale,
    preferredWindow: r.preferredWindow,
    topic: r.topic,
    notes: r.notes,
    source: r.source,
    status: r.status,
    attempts: r.attempts,
    outcome: r.outcome,
    dueAt: r.dueAt,
    createdAt: r.createdAt,
    handledAt: r.handledAt,
    clientProfileId: r.clientProfileId,
    clientName: r.client?.fullName ?? null,
    chatSessionId: r.chatSessionId,
    assignedToId: r.assignedToId,
    assignedToName: r.assignedToId ? names.get(r.assignedToId) ?? null : null,
    handledByName: r.handledById ? names.get(r.handledById) ?? null : null,
  }));
}

export async function assignCallback(id: string, userId: string | null): Promise<void> {
  await prisma.callbackRequest.update({ where: { id }, data: { assignedToId: userId } });
}

const outcomeSchema = z.object({
  id: z.string().min(1),
  outcome: z.enum(CALLBACK_OUTCOMES),
  note: z.string().trim().max(2000).optional(),
  byUserId: z.string().min(1),
});
export type LogCallbackOutcomeInput = z.input<typeof outcomeSchema>;

/**
 * Records one call attempt: bumps attempts, stamps who/when, writes a CALL
 * activity with the outcome, and either closes the request or (no answer)
 * keeps it open with the next attempt scheduled.
 */
export async function logCallbackOutcome(input: LogCallbackOutcomeInput, now: Date = new Date()) {
  const data = outcomeSchema.parse(input);
  const existing = await prisma.callbackRequest.findUnique({ where: { id: data.id } });
  if (!existing) throw new Error("Call-back not found");
  if (!(OPEN_CALLBACK_STATUSES as readonly string[]).includes(existing.status)) throw new Error("This call-back is already closed");

  const attempts = existing.attempts + 1;
  const noAnswer = data.outcome === "NO_ANSWER";
  const hours = noAnswer ? await getSetting("hours").catch(() => null) : null;
  const nextDue = noAnswer ? nextAttemptAt(hours, now, attempts) : null;

  const clientProfileId =
    existing.clientProfileId ?? (await findOrCreateLeadByPhone({ phone: existing.phone, name: existing.name })).clientProfileId;

  const updated = await prisma.callbackRequest.update({
    where: { id: data.id },
    data: {
      attempts,
      status: noAnswer ? "NO_ANSWER" : "DONE",
      outcome: data.outcome,
      handledById: data.byUserId,
      handledAt: now,
      dueAt: noAnswer ? nextDue : existing.dueAt,
      clientProfileId,
      assignedToId: existing.assignedToId ?? data.byUserId,
    },
  });

  await logActivity({
    clientProfileId,
    authorUserId: data.byUserId,
    kind: "CALL",
    outcome: data.outcome,
    body: [`Call-back attempt ${attempts}: ${CALLBACK_OUTCOME_LABELS[data.outcome]}.`, data.note].filter(Boolean).join("\n"),
  });
  if (noAnswer && nextDue) {
    await prisma.clientProfile.update({ where: { id: clientProfileId }, data: { nextFollowUpAt: nextDue } });
  }
  return updated;
}

/** Open call-backs that are due now (for the notification bell). */
export async function dueCallbacks(now: Date = new Date(), take = 5) {
  const where = {
    status: { in: [...OPEN_CALLBACK_STATUSES] },
    OR: [{ dueAt: null }, { dueAt: { lte: now } }],
  };
  const [count, items] = await Promise.all([
    prisma.callbackRequest.count({ where }),
    prisma.callbackRequest.findMany({ where, orderBy: { createdAt: "desc" }, take }),
  ]);
  return { count, items };
}
