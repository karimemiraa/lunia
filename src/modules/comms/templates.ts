// Registry of bilingual, per-channel message templates (MessageTemplate),
// and renderTemplate() — the richer replacement for
// src/modules/booking/outbox.ts's renderMessageBody(). Staff manage
// templates via upsertTemplate/listTemplates/getTemplate (Stage 6's admin
// CMS calls these); processDueMessages() (a later task) will call
// renderTemplate() instead of the old static renderMessageBody().

import { z } from "zod";
import { prisma } from "@/lib/db";
import type { MessageTemplate } from "@prisma/client";
import { renderMessageBody } from "@/modules/booking/outbox";

const KIND_VALUES = ["CONFIRMATION", "REMINDER_24H", "POST_VISIT", "OTP"] as const;
const LOCALE_VALUES = ["ar", "en"] as const;
const CHANNEL_VALUES = ["whatsapp", "sms"] as const;

const kindSchema = z.enum(KIND_VALUES);
const localeSchema = z.enum(LOCALE_VALUES);
const channelSchema = z.enum(CHANNEL_VALUES);

const upsertTemplateSchema = z.object({
  kind: kindSchema,
  locale: localeSchema,
  channel: channelSchema,
  bodyTemplate: z.string().min(1),
  providerTemplateName: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

// Callers (e.g. an admin CMS form) pass plain strings for kind/locale/channel
// — upsertTemplateSchema.parse() below is what actually enforces the enums
// at runtime, so this exported type is intentionally wider than the
// schema's own inferred (literal-union) input type.
export type UpsertTemplateInput = {
  kind: string;
  locale: string;
  channel: string;
  bodyTemplate: string;
  providerTemplateName?: string;
  isActive?: boolean;
};

// The other channel, for the whatsapp<->sms fallback step in renderTemplate.
function otherChannel(channel: string): string | undefined {
  if (channel === "whatsapp") return "sms";
  if (channel === "sms") return "whatsapp";
  return undefined;
}

// Replaces every {{token}} occurrence in `bodyTemplate` with
// params[token]; an unknown/missing token is replaced with "" rather than
// left as raw {{token}} text.
function interpolate(bodyTemplate: string, params: Record<string, string>): string {
  return bodyTemplate.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token: string) => params[token] ?? "");
}

async function findActive(kind: string, locale: string, channel: string): Promise<MessageTemplate | null> {
  return prisma.messageTemplate.findFirst({
    where: { kind, locale, channel, isActive: true },
  });
}

// Looks up the active MessageTemplate for (kind, locale, channel) and
// interpolates `params` into it. Falls back, in order, when no exact row is
// active:
//   1. same kind+locale, the other channel (whatsapp<->sms)
//   2. same kind+channel (the originally requested channel), locale "en"
//   3. a built-in default that mirrors outbox.renderMessageBody's text for
//      the kind/locale (so rendering never fails even with an empty
//      registry)
export async function renderTemplate(
  kind: string,
  locale: string,
  channel: string,
  params: Record<string, string>,
): Promise<{ body: string; providerTemplateName?: string }> {
  let template = await findActive(kind, locale, channel);

  if (!template) {
    const fallbackChannel = otherChannel(channel);
    if (fallbackChannel) {
      template = await findActive(kind, locale, fallbackChannel);
    }
  }

  if (!template && locale !== "en") {
    template = await findActive(kind, "en", channel);
  }

  if (!template) {
    return { body: renderMessageBody(kind, locale, params) };
  }

  return {
    body: interpolate(template.bodyTemplate, params),
    providerTemplateName: template.providerTemplateName ?? undefined,
  };
}

// Lists every MessageTemplate row (active and inactive), most recently
// updated first.
export async function listTemplates(): Promise<MessageTemplate[]> {
  return prisma.messageTemplate.findMany({ orderBy: { updatedAt: "desc" } });
}

// Fetches a single MessageTemplate by its unique (kind, locale, channel)
// key, or null if none exists (regardless of isActive).
export async function getTemplate(kind: string, locale: string, channel: string): Promise<MessageTemplate | null> {
  return prisma.messageTemplate.findUnique({
    where: { kind_locale_channel: { kind, locale, channel } },
  });
}

// Validates `input` and creates or updates the MessageTemplate row for its
// (kind, locale, channel) unique key.
export async function upsertTemplate(input: UpsertTemplateInput): Promise<MessageTemplate> {
  const data = upsertTemplateSchema.parse(input);
  return prisma.messageTemplate.upsert({
    where: { kind_locale_channel: { kind: data.kind, locale: data.locale, channel: data.channel } },
    update: {
      bodyTemplate: data.bodyTemplate,
      providerTemplateName: data.providerTemplateName ?? null,
      isActive: data.isActive ?? true,
    },
    create: {
      kind: data.kind,
      locale: data.locale,
      channel: data.channel,
      bodyTemplate: data.bodyTemplate,
      providerTemplateName: data.providerTemplateName ?? null,
      isActive: data.isActive ?? true,
    },
  });
}
