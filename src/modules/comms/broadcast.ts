// Broadcast (announcement/campaign) sending: resolve a customer segment,
// deliver one message to each recipient through the same CommsSender pipeline
// as booking messages (stub in non-production), and record a Broadcast row +
// per-recipient CommunicationLog entries.
//
// PRIVACY (PDPL): every audience excludes customers who have opted out of
// marketing (NotificationPreference.marketingOptIn === false). A broadcast is
// promotional by nature, so this opt-out is always honoured.

import { prisma } from "@/lib/db";
import { renderEmailHtml } from "@/modules/comms/emailLayout";
import { resolveSenderForChannel } from "@/modules/comms/sender";
import { interpolateTemplate } from "@/modules/comms/templateCatalog";

export const BROADCAST_CHANNELS = ["email", "whatsapp", "sms"] as const;
export type BroadcastChannel = (typeof BROADCAST_CHANNELS)[number];

export interface AudienceOption {
  key: string;
  label: string;
  count: number;
}

// Builds the Prisma where-clause for an audience key, always excluding
// marketing opt-outs. Returns null for an unknown key.
function audienceWhere(key: string): Record<string, unknown> | null {
  // marketingOptIn defaults to true and a customer may have no preference row
  // at all, so "opted out" is specifically marketingOptIn === false.
  const notOptedOut = {
    NOT: { notificationPreference: { is: { marketingOptIn: false } } },
  };

  if (key === "all") return { ...notOptedOut };
  if (key.startsWith("tier:")) {
    const tierId = key.slice("tier:".length);
    return { ...notOptedOut, membership: { is: { tierId } } };
  }
  if (key.startsWith("stage:")) {
    const stage = key.slice("stage:".length);
    return { ...notOptedOut, stage };
  }
  return null;
}

// The selectable audiences, each with a live recipient count. "All customers"
// plus one entry per membership tier.
export async function listAudiences(): Promise<AudienceOption[]> {
  const tiers = await prisma.membershipTier.findMany({ orderBy: { minPoints: "asc" } });
  const keys = ["all", ...tiers.map((t) => `tier:${t.id}`)];
  const labels: Record<string, string> = {
    all: "All customers",
    ...Object.fromEntries(tiers.map((t) => [`tier:${t.id}`, `${t.name} tier`])),
  };

  const options: AudienceOption[] = [];
  for (const key of keys) {
    const where = audienceWhere(key);
    if (!where) continue;
    const count = await prisma.clientProfile.count({ where });
    options.push({ key, label: labels[key] ?? key, count });
  }
  return options;
}

interface Recipient {
  clientProfileId: string;
  name: string;
  email: string | null;
  phone: string | null;
}

async function resolveRecipients(audienceKey: string): Promise<Recipient[]> {
  const where = audienceWhere(audienceKey);
  if (!where) return [];
  const profiles = await prisma.clientProfile.findMany({
    where,
    select: { id: true, fullName: true, user: { select: { email: true, phone: true } } },
  });
  return profiles.map((p) => ({
    clientProfileId: p.id,
    name: p.fullName,
    email: p.user.email,
    phone: p.user.phone,
  }));
}

export interface SendBroadcastInput {
  channel: BroadcastChannel;
  locale: string;
  subject?: string;
  body: string;
  audience: string;
  audienceLabel: string;
  createdById?: string | null;
}

export interface SendBroadcastResult {
  broadcastId: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  skippedNoContact: number;
}

// Sends the broadcast to every resolvable recipient in the audience. Each
// recipient must have the contact field the channel needs (email for email;
// phone for whatsapp/sms) — those without are skipped (counted but never
// marked failed). {{name}} in the body is replaced with the recipient's first
// name. Email bodies are wrapped in the branded renderEmailHtml layout so they
// match every other Lunia email.
export async function sendBroadcast(input: SendBroadcastInput): Promise<SendBroadcastResult> {
  const recipients = await resolveRecipients(input.audience);
  const sender = resolveSenderForChannel(input.channel);
  const subject = input.subject?.trim() || "Lunia";

  let sentCount = 0;
  let failedCount = 0;
  let skippedNoContact = 0;

  for (const r of recipients) {
    const toEmail = input.channel === "email" ? r.email : null;
    const toPhone = input.channel === "email" ? null : r.phone;
    if ((input.channel === "email" && !toEmail) || (input.channel !== "email" && !toPhone)) {
      skippedNoContact += 1;
      continue;
    }

    const firstName = r.name.trim().split(/\s+/)[0] ?? "";
    const text = interpolateTemplate(input.body, { name: firstName });

    try {
      const result = await sender.send({
        channel: input.channel,
        toEmail: toEmail ?? undefined,
        toPhone: toPhone ?? undefined,
        subject: input.channel === "email" ? subject : undefined,
        body: text,
        kind: "BROADCAST",
        recipientName: r.name || undefined,
        locale: input.locale,
      });

      await prisma.communicationLog.create({
        data: {
          channel: input.channel,
          kind: "BROADCAST",
          toEmail: toEmail ?? null,
          toPhone: toPhone ?? null,
          status: result.ok ? "SENT" : "FAILED",
          body: input.channel === "email" ? renderEmailHtml({ subject, body: text, recipientName: r.name, locale: input.locale }) : text,
          providerRef: result.providerRef ?? null,
        },
      });

      if (result.ok) sentCount += 1;
      else failedCount += 1;
    } catch (err) {
      failedCount += 1;
      console.error("[sendBroadcast] send threw for recipient", r.clientProfileId, err);
    }
  }

  const broadcast = await prisma.broadcast.create({
    data: {
      channel: input.channel,
      locale: input.locale,
      subject: input.channel === "email" ? subject : null,
      body: input.body,
      audience: input.audience,
      audienceLabel: input.audienceLabel,
      recipientCount: recipients.length,
      sentCount,
      failedCount,
      createdById: input.createdById ?? null,
    },
  });

  return {
    broadcastId: broadcast.id,
    recipientCount: recipients.length,
    sentCount,
    failedCount,
    skippedNoContact,
  };
}

export async function listRecentBroadcasts(limit = 20) {
  return prisma.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
