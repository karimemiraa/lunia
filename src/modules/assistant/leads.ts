// Lead capture from the website assistant. As soon as a visitor gives a phone
// number, they become a CRM lead: we find-or-create their ClientProfile
// (source "chat", inbound), merge what the consultation learned without
// overwriting anything staff already entered, and log the consultation as a
// LeadActivity note so the team sees it on the customer's timeline.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { firstStageKey } from "@/modules/crm/pipeline";
import { logActivity } from "@/modules/crm/leads";
import { CONCERN_LABELS, CONTRA_LABELS, EVENT_LABELS, GOAL_LABELS, describeDuration } from "./copy";
import { phoneVariants } from "./phone";
import type { ConsultProfile } from "./types";

/**
 * Soft author id for activities written by the assistant itself (there is no
 * staff member behind them). LeadActivity.authorUserId is a soft reference,
 * and listLeadActivities renders this id as "Website assistant".
 */
export const ASSISTANT_AUTHOR_ID = "system:assistant";
export const ASSISTANT_AUTHOR_NAME = "Website assistant";
export const CHAT_SOURCE_CHANNEL = "chat";
export const CHAT_TAG = "chat-assistant";

/** Finds a customer by any stored spelling of `phone`, else creates a lead. */
export async function findOrCreateLeadByPhone(input: {
  phone: string;
  name?: string | null;
  sourceChannel?: string;
}): Promise<{ clientProfileId: string; created: boolean }> {
  const variants = phoneVariants(input.phone);
  const name = input.name?.trim() || "";
  const existing = await prisma.user.findFirst({ where: { phone: { in: variants } }, include: { clientProfile: true } });
  if (existing?.clientProfile) return { clientProfileId: existing.clientProfile.id, created: false };

  const stage = await firstStageKey();
  const profileData = {
    fullName: name,
    sourceChannel: input.sourceChannel ?? CHAT_SOURCE_CHANNEL,
    direction: "INBOUND" as const,
    stage,
  };
  if (existing) {
    const profile = await prisma.clientProfile.create({ data: { userId: existing.id, ...profileData } });
    return { clientProfileId: profile.id, created: true };
  }
  try {
    const user = await prisma.user.create({
      data: { type: "CLIENT", phone: input.phone, clientProfile: { create: profileData } },
      include: { clientProfile: true },
    });
    return { clientProfileId: user.clientProfile!.id, created: true };
  } catch (err) {
    // Two requests racing to create the same phone: the loser re-reads.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const again = await prisma.user.findFirst({ where: { phone: { in: variants } }, include: { clientProfile: true } });
      if (again?.clientProfile) return { clientProfileId: again.clientProfile.id, created: false };
    }
    throw err;
  }
}

/**
 * Adds consultation facts to the customer record without clobbering staff
 * data: concerns and tags are unioned, skin type / name / direction are only
 * filled when empty.
 */
export async function mergeConsultIntoClient(clientProfileId: string, profile: ConsultProfile, name?: string | null): Promise<void> {
  const client = await prisma.clientProfile.findUnique({ where: { id: clientProfileId } });
  if (!client) return;
  const concerns = [...new Set([...client.skinConcerns, ...profile.concerns.map((c) => CONCERN_LABELS[c].en.toLowerCase())])];
  const tags = client.tags.includes(CHAT_TAG) ? client.tags : [...client.tags, CHAT_TAG];
  await prisma.clientProfile.update({
    where: { id: clientProfileId },
    data: {
      skinConcerns: concerns,
      tags,
      skinType: client.skinType ?? (profile.skinType ? profile.skinType : undefined),
      fullName: client.fullName.trim() ? undefined : name?.trim() || undefined,
      direction: client.direction ?? "INBOUND",
      sourceChannel: client.sourceChannel ?? CHAT_SOURCE_CHANNEL,
    },
  });
}

const TREATMENT_NAMES: Record<string, string> = {
  home_products: "at-home products",
  clinic_treatments: "clinic treatments",
  vitamin_c: "vitamin C",
  home_remedies: "home remedies",
};

/** A concise, staff-facing (English) summary of the consultation. */
export function buildConsultSummary(input: {
  profile: ConsultProfile;
  recommended: string[];
  outcome?: string | null;
  extra?: string;
}): string {
  const p = input.profile;
  const lines: string[] = ["Website assistant consultation."];
  if (p.concerns.length) lines.push(`Concerns: ${p.concerns.map((c) => CONCERN_LABELS[c].en).join(", ")}.`);
  if (p.areas.length) lines.push(`Area: ${p.areas.join(", ")}.`);
  if (p.durationMonths !== undefined || p.durationText) {
    lines.push(`Duration: ${p.durationText ?? describeDuration(p.durationMonths!, "en")}.`);
  }
  if (p.previousTreatments.length || p.triedText) {
    const tried = p.previousTreatments.map((t) => TREATMENT_NAMES[t] ?? t.replace(/_/g, " "));
    if (p.triedText && p.triedText !== "none") tried.push(`"${p.triedText}"`);
    lines.push(`Tried: ${tried.length ? tried.join(", ") : "nothing yet"}.`);
  }
  const goal: string[] = p.goals.map((g) => GOAL_LABELS[g].en);
  if (p.event) goal.push(`${EVENT_LABELS[p.event].en}${p.timelineWeeks ? ` in ~${p.timelineWeeks} weeks` : ""}`);
  else if (p.timelineWeeks) goal.push(`within ~${p.timelineWeeks} weeks`);
  if (p.timelineText) goal.push(`"${p.timelineText}"`);
  if (goal.length) lines.push(`Goal: ${goal.join("; ")}.`);
  if (p.skinType) lines.push(`Skin type: ${p.skinType}.`);
  if (p.contraindications.length) lines.push(`Safety flags: ${p.contraindications.map((c) => CONTRA_LABELS[c].en).join(", ")}.`);
  else if (p.safetyAnswered) lines.push("Safety: none reported.");
  if (p.notes.length) lines.push(`Visitor notes: ${p.notes.slice(0, 3).map((n) => `"${n}"`).join(" ")}`);
  if (input.recommended.length) lines.push(`Recommended: ${input.recommended.join(", ")}.`);
  if (input.outcome) lines.push(`Outcome: ${input.outcome.toLowerCase()}.`);
  if (input.extra) lines.push(input.extra);
  return lines.join("\n");
}

export interface CaptureInput {
  clientProfileId: string | null;
  phone: string;
  name?: string | null;
  profile: ConsultProfile;
  recommended: string[];
  outcome?: string | null;
  /** The last outcome already written to the timeline for this chat (if any). */
  notedOutcome?: string | null;
  extra?: string;
}

/**
 * Idempotent per chat: links/creates the customer, merges the profile, and
 * writes a timeline note the first time, then again only when the outcome
 * improves (e.g. LEAD -> BOOKED). Returns what the caller should persist.
 */
export async function captureChatLead(input: CaptureInput): Promise<{ clientProfileId: string; notedOutcome: string }> {
  const clientProfileId =
    input.clientProfileId ?? (await findOrCreateLeadByPhone({ phone: input.phone, name: input.name })).clientProfileId;
  await mergeConsultIntoClient(clientProfileId, input.profile, input.name);

  const outcome = input.outcome ?? "LEAD";
  if (input.notedOutcome !== outcome) {
    const first = !input.notedOutcome;
    await logActivity({
      clientProfileId,
      authorUserId: ASSISTANT_AUTHOR_ID,
      kind: "NOTE",
      outcome: `CHAT_${outcome}`,
      body: first
        ? buildConsultSummary({ profile: input.profile, recommended: input.recommended, outcome, extra: input.extra })
        : `Website assistant: outcome ${outcome.toLowerCase()}.${input.extra ? `\n${input.extra}` : ""}`,
    });
  }
  return { clientProfileId, notedOutcome: outcome };
}
