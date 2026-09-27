// Read side for the /admin/assistant pages: chat sessions with their extracted
// profile, recommendations and outcome, plus the full transcript for one.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CONCERN_LABELS } from "./copy";
import type { TranscriptEntry } from "./service";
import { emptyProfile, type ConsultProfile } from "./types";

export const OUTCOME_FILTERS = ["BOOKED", "CALLBACK", "WHATSAPP", "LEAD", "ABANDONED", "IN_PROGRESS"] as const;
export type OutcomeFilter = (typeof OUTCOME_FILTERS)[number];

/** A chat with no outcome and no activity for this long counts as abandoned. */
const ABANDON_AFTER_MS = 60 * 60 * 1000;

export function displayOutcome(outcome: string | null, updatedAt: Date, now: Date = new Date()): string {
  if (outcome) return outcome;
  return now.getTime() - updatedAt.getTime() > ABANDON_AFTER_MS ? "ABANDONED" : "IN_PROGRESS";
}

export function profileFacts(raw: unknown): ConsultProfile {
  const stored = (raw ?? {}) as Record<string, unknown>;
  const facts = Object.fromEntries(Object.entries(stored).filter(([k]) => !k.startsWith("_")));
  return { ...emptyProfile(), ...(facts as Partial<ConsultProfile>) };
}

export interface ChatSessionRow {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  name: string | null;
  phone: string | null;
  locale: string;
  concerns: string[];
  outcome: string;
  recommended: string[];
  messageCount: number;
  clientProfileId: string | null;
}

async function serviceNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.service.findMany({ where: { id: { in: ids } }, select: { id: true, nameEn: true } });
  return new Map(rows.map((r) => [r.id, r.nameEn]));
}

export async function listChatSessions(filter: { outcome?: OutcomeFilter; page?: number; pageSize?: number } = {}): Promise<{ rows: ChatSessionRow[]; total: number }> {
  const pageSize = filter.pageSize ?? 50;
  const page = Math.max(1, filter.page ?? 1);
  const cutoff = new Date(Date.now() - ABANDON_AFTER_MS);
  // Only conversations where the visitor actually said something.
  const where: Prisma.ChatSessionWhereInput = { NOT: { state: "start" } };
  if (filter.outcome === "ABANDONED") Object.assign(where, { OR: [{ outcome: "ABANDONED" }, { outcome: null, updatedAt: { lt: cutoff } }] });
  else if (filter.outcome === "IN_PROGRESS") Object.assign(where, { outcome: null, updatedAt: { gte: cutoff } });
  else if (filter.outcome) where.outcome = filter.outcome;

  const [total, rows] = await Promise.all([
    prisma.chatSession.count({ where }),
    prisma.chatSession.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const names = await serviceNames([...new Set(rows.flatMap((r) => r.recommendedServiceIds))]);
  return {
    total,
    rows: rows.map((r) => {
      const p = profileFacts(r.profile);
      return {
        id: r.id,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        name: r.name,
        phone: r.phone,
        locale: r.locale,
        concerns: p.concerns.map((c) => CONCERN_LABELS[c]?.en ?? c),
        outcome: displayOutcome(r.outcome, r.updatedAt),
        recommended: r.recommendedServiceIds.map((id) => names.get(id)).filter((x): x is string => !!x),
        messageCount: Array.isArray(r.transcript) ? r.transcript.length : 0,
        clientProfileId: r.clientProfileId,
      };
    }),
  };
}

export async function getChatSessionDetail(id: string) {
  const row = await prisma.chatSession.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, fullName: true } },
      callbacks: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!row) return null;
  const [names, booking] = await Promise.all([
    serviceNames(row.recommendedServiceIds),
    row.bookingId
      ? prisma.booking.findUnique({ where: { id: row.bookingId }, include: { appointments: { include: { service: { select: { nameEn: true } } } } } })
      : Promise.resolve(null),
  ]);
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    locale: row.locale,
    state: row.state,
    name: row.name,
    phone: row.phone,
    outcome: displayOutcome(row.outcome, row.updatedAt),
    profile: profileFacts(row.profile),
    transcript: (Array.isArray(row.transcript) ? row.transcript : []) as unknown as TranscriptEntry[],
    recommended: row.recommendedServiceIds.map((sid) => ({ id: sid, name: names.get(sid) ?? "(removed service)" })),
    client: row.client,
    booking: booking
      ? {
          id: booking.id,
          status: booking.status,
          startAt: booking.appointments[0]?.startAt ?? null,
          serviceName: booking.appointments[0]?.service.nameEn ?? null,
        }
      : null,
    callbacks: row.callbacks.map((c) => ({ id: c.id, status: c.status, preferredWindow: c.preferredWindow, dueAt: c.dueAt, outcome: c.outcome, createdAt: c.createdAt })),
  };
}
