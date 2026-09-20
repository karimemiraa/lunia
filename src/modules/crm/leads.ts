// Outbound + inbound sales CRM: pipeline stages, owner assignment, follow-ups,
// and an activity log of outreach touches. A "lead" is just a ClientProfile in
// an early pipeline stage (so telesales can add people they've tried to reach
// without a booking), which lets the same person flow all the way to a booked,
// won customer without a separate model.

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { LeadDirection, ClientProfile } from "@prisma/client";
import { listStages, firstStageKey } from "@/modules/crm/pipeline";

export const ACTIVITY_KINDS = ["CALL", "WHATSAPP", "EMAIL", "SMS", "NOTE"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number] | "STAGE_CHANGE" | "ASSIGN";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface LeadActivityRow {
  id: string;
  kind: string;
  outcome: string | null;
  body: string | null;
  authorName?: string;
  createdAt: Date;
}

/** Newest-first activity timeline for a lead/customer, with author names resolved. */
export async function listLeadActivities(clientProfileId: string): Promise<LeadActivityRow[]> {
  const rows = await prisma.leadActivity.findMany({ where: { clientProfileId }, orderBy: { createdAt: "desc" } });
  if (rows.length === 0) return [];
  const authorIds = [...new Set(rows.map((r) => r.authorUserId))];
  const authors = await prisma.user.findMany({ where: { id: { in: authorIds } }, include: { staffProfile: true } });
  const nameById = new Map(authors.map((u) => [u.id, u.staffProfile?.fullName]));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    outcome: r.outcome,
    body: r.body,
    authorName: nameById.get(r.authorUserId) ?? undefined,
    createdAt: r.createdAt,
  }));
}

export interface LogActivityInput {
  clientProfileId: string;
  authorUserId: string;
  kind: string;
  outcome?: string | null;
  body?: string | null;
}

export async function logActivity(input: LogActivityInput): Promise<void> {
  await prisma.leadActivity.create({
    data: {
      clientProfileId: input.clientProfileId,
      authorUserId: input.authorUserId,
      kind: input.kind,
      outcome: input.outcome?.trim() || null,
      body: input.body?.trim() || null,
    },
  });
}

/** Moves a lead to a new pipeline stage (stage key) and records a STAGE_CHANGE activity. */
export async function setLeadStage(clientProfileId: string, stage: string, byUserId: string): Promise<void> {
  await prisma.clientProfile.update({ where: { id: clientProfileId }, data: { stage } });
  await logActivity({ clientProfileId, authorUserId: byUserId, kind: "STAGE_CHANGE", outcome: stage });
}

/** Assigns (or clears) the owning staff member and records an ASSIGN activity. */
export async function assignOwner(clientProfileId: string, ownerId: string | null, byUserId: string): Promise<void> {
  await prisma.clientProfile.update({ where: { id: clientProfileId }, data: { ownerId } });
  let ownerName = "Unassigned";
  if (ownerId) {
    const owner = await prisma.staffProfile.findUnique({ where: { userId: ownerId }, select: { fullName: true } });
    ownerName = owner?.fullName ?? "Assigned";
  }
  await logActivity({ clientProfileId, authorUserId: byUserId, kind: "ASSIGN", outcome: ownerName });
}

/** Sets or clears the next follow-up date for a non-responder. */
export async function setFollowUp(clientProfileId: string, date: Date | null): Promise<void> {
  await prisma.clientProfile.update({ where: { id: clientProfileId }, data: { nextFollowUpAt: date } });
}

export interface PipelineCard {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  stage: string;
  direction: LeadDirection | null;
  ownerId: string | null;
  ownerName: string | null;
  source: string | null;
  nextFollowUpAt: Date | null;
  createdAt: Date;
}

// The whole pipeline grouped by stage, for the Leads board. Optional filters
// by direction (inbound/outbound) and source channel. Each column is capped
// so a large customer base can't render thousands of cards.
const PIPELINE_COLUMN_CAP = 100;

export async function listPipeline(filter?: {
  direction?: LeadDirection;
  source?: string;
}): Promise<{ columns: Record<string, PipelineCard[]>; counts: Record<string, number> }> {
  const where: Prisma.ClientProfileWhereInput = {};
  if (filter?.direction) where.direction = filter.direction;
  if (filter?.source) where.sourceChannel = filter.source;

  const [stages, profiles] = await Promise.all([
    listStages(),
    prisma.clientProfile.findMany({
      where,
      include: { user: { select: { phone: true, email: true } } },
      orderBy: [{ nextFollowUpAt: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  const ownerIds = [...new Set(profiles.map((p) => p.ownerId).filter((x): x is string => !!x))];
  const owners = ownerIds.length
    ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, include: { staffProfile: true } })
    : [];
  const ownerNameById = new Map(owners.map((u) => [u.id, u.staffProfile?.fullName ?? u.email ?? u.id]));

  const stageKeySet = new Set(stages.map((s) => s.key));
  const fallbackKey = stages[0]?.key ?? "new";
  const columns = Object.fromEntries(stages.map((s) => [s.key, [] as PipelineCard[]])) as Record<string, PipelineCard[]>;
  const counts = Object.fromEntries(stages.map((s) => [s.key, 0])) as Record<string, number>;

  for (const p of profiles) {
    // A lead whose stage key no longer exists (e.g. its stage was deleted)
    // falls into the first column so it's never lost from the board.
    const key = stageKeySet.has(p.stage) ? p.stage : fallbackKey;
    counts[key] += 1;
    if (columns[key].length >= PIPELINE_COLUMN_CAP) continue;
    columns[key].push({
      id: p.id,
      name: p.fullName,
      phone: p.user.phone,
      email: p.user.email,
      stage: p.stage,
      direction: p.direction,
      ownerId: p.ownerId,
      ownerName: p.ownerId ? ownerNameById.get(p.ownerId) ?? null : null,
      source: p.sourceChannel,
      nextFollowUpAt: p.nextFollowUpAt,
      createdAt: p.createdAt,
    });
  }

  return { columns, counts };
}

// Distinct source channels present on customers/leads, for the board filter.
export async function listLeadSources(): Promise<string[]> {
  const rows = await prisma.clientProfile.findMany({
    where: { sourceChannel: { not: null } },
    select: { sourceChannel: true },
    distinct: ["sourceChannel"],
  });
  return rows.map((r) => r.sourceChannel).filter((x): x is string => !!x).sort();
}

export interface CreateLeadInput {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  direction: LeadDirection;
  source?: string | null;
  ownerId?: string | null;
  stage?: string;
  byUserId: string;
}

/**
 * Adds a lead (e.g. someone telesales tried to reach): creates the underlying
 * CLIENT user + ClientProfile with pipeline fields set. Reuses an existing
 * user when the phone/email already matches, so we never duplicate a person.
 */
export async function createLead(input: CreateLeadInput): Promise<{ clientProfileId: string }> {
  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("A name is required");
  const phone = input.phone?.trim() || null;
  const email = input.email?.trim().toLowerCase() || null;
  if (!phone && !email) throw new Error("A phone or email is required");
  if (email && !EMAIL_RE.test(email)) throw new Error("Please enter a valid email address");

  // Reuse an existing user by phone/email if present.
  const existing = phone
    ? await prisma.user.findUnique({ where: { phone } })
    : email
      ? await prisma.user.findUnique({ where: { email } })
      : null;

  const stage = input.stage ?? (await firstStageKey());
  let profile: ClientProfile;
  if (existing) {
    profile = await prisma.clientProfile.upsert({
      where: { userId: existing.id },
      update: { ownerId: input.ownerId ?? undefined, stage, direction: input.direction },
      create: {
        userId: existing.id,
        fullName,
        sourceChannel: input.source ?? null,
        ownerId: input.ownerId ?? null,
        stage,
        direction: input.direction,
      },
    });
  } else {
    const user = await prisma.user.create({
      data: {
        type: "CLIENT",
        phone,
        email,
        clientProfile: {
          create: {
            fullName,
            sourceChannel: input.source ?? null,
            ownerId: input.ownerId ?? null,
            stage,
            direction: input.direction,
          },
        },
      },
      include: { clientProfile: true },
    });
    profile = user.clientProfile!;
  }

  await logActivity({ clientProfileId: profile.id, authorUserId: input.byUserId, kind: "NOTE", outcome: "LEAD_CREATED", body: `Lead added (${input.direction.toLowerCase()}${input.source ? `, ${input.source}` : ""})` });
  return { clientProfileId: profile.id };
}
