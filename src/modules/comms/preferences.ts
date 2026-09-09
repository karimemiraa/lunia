import { prisma } from "@/lib/db";
import type { CommsChannelPref, NotificationPreference } from "@prisma/client";

// Resolved defaults for a client with no NotificationPreference row yet.
export const DEFAULT_PREFERENCE = {
  channel: "AUTO" as CommsChannelPref,
  remindersOptIn: true,
  postVisitOptIn: true,
  marketingOptIn: true,
};

export type PreferenceValues = typeof DEFAULT_PREFERENCE;

// Returns the client's stored preference, or the defaults if none exists.
export async function getPreference(clientProfileId: string): Promise<PreferenceValues> {
  const row = await prisma.notificationPreference.findUnique({ where: { clientProfileId } });
  if (!row) return { ...DEFAULT_PREFERENCE };
  return {
    channel: row.channel,
    remindersOptIn: row.remindersOptIn,
    postVisitOptIn: row.postVisitOptIn,
    marketingOptIn: row.marketingOptIn,
  };
}

export interface PreferencePatch {
  channel?: CommsChannelPref;
  remindersOptIn?: boolean;
  postVisitOptIn?: boolean;
  marketingOptIn?: boolean;
}

// Upserts the client's preference. Only provided fields change.
export async function upsertPreference(
  clientProfileId: string,
  patch: PreferencePatch,
): Promise<NotificationPreference> {
  return prisma.notificationPreference.upsert({
    where: { clientProfileId },
    create: { clientProfileId, ...patch },
    update: { ...patch },
  });
}

// Maps a CommsChannelPref to a concrete delivery channel string. AUTO means
// "no explicit preference" and resolves to null so the caller falls back to
// its own default (global setting / provider-derived / identifier-derived).
export function prefToChannel(pref: CommsChannelPref): "whatsapp" | "sms" | "email" | null {
  switch (pref) {
    case "WHATSAPP":
      return "whatsapp";
    case "SMS":
      return "sms";
    case "EMAIL":
      return "email";
    case "AUTO":
    default:
      return null;
  }
}

// Resolves the concrete delivery channel for a message:
//   1. the client's explicit preference (if not AUTO),
//   2. otherwise the caller's globalDefault (already concrete),
//   3. otherwise identifier-derived (email identifier -> email; else sms).
export function resolveDeliveryChannel(input: {
  preferenceChannel?: CommsChannelPref;
  identifierKind?: "phone" | "email";
  globalDefault?: "whatsapp" | "sms" | "email" | null;
}): "whatsapp" | "sms" | "email" {
  const fromPref = input.preferenceChannel ? prefToChannel(input.preferenceChannel) : null;
  if (fromPref) return fromPref;
  if (input.globalDefault) return input.globalDefault;
  if (input.identifierKind === "email") return "email";
  return "sms";
}
