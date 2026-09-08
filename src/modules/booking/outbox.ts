// Outbox for booking-related client messages (WhatsApp/SMS confirmations,
// reminders, post-visit follow-ups). scheduleMessage() inserts PENDING
// ScheduledMessage rows (Task 3's booking service calls this). This module
// also implements the delivery side: processDueMessages() picks up due
// PENDING rows, renders a message body, hands it to a CommsSender, and
// records the outcome (ScheduledMessage status flip + a CommunicationLog
// row). The CommsSender used here (stubSender) is a stand-in that only logs
// — Stage 6 wires a real WhatsApp/SMS provider behind the same interface.

import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma, ScheduledMessage } from "@prisma/client";
import { getCommsConfig } from "@/modules/comms/config";
// NOTE: comms/templates.ts imports renderMessageBody from this file, so this
// is a circular import. Safe: both bindings are only referenced inside
// function bodies (never at module-eval time), a standard safe cycle under
// Node/Vite ESM. Keep it that way — a future top-level use of either import
// here or in templates.ts would break at load time.
import { renderTemplate } from "@/modules/comms/templates";

const msgKindSchema = z.enum(["CONFIRMATION", "REMINDER_24H", "POST_VISIT"]);
export type MsgKind = z.infer<typeof msgKindSchema>;

// Payload is a free-form JSON object (message-template data); Prisma's Json
// column accepts any JSON-serializable value, which z.unknown() can't
// statically prove, so the create() call below narrows it with a single
// justified cast.
const scheduleMessageSchema = z.object({
  bookingId: z.string().min(1).optional(),
  kind: msgKindSchema,
  toPhone: z.string().min(1),
  locale: z.string().min(1),
  sendAt: z.date(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type ScheduleMessageInput = z.infer<typeof scheduleMessageSchema>;

// Validates `input` and inserts a PENDING ScheduledMessage row.
export async function scheduleMessage(input: ScheduleMessageInput): Promise<ScheduledMessage> {
  const data = scheduleMessageSchema.parse(input);
  return prisma.scheduledMessage.create({
    data: {
      bookingId: data.bookingId ?? null,
      kind: data.kind,
      toPhone: data.toPhone,
      locale: data.locale,
      sendAt: data.sendAt,
      payload: data.payload as Prisma.InputJsonValue,
    },
  });
}

// --- Delivery ---------------------------------------------------------

// The interface a message-sending provider implements. Stage 6 swaps in a
// real WhatsApp/SMS provider behind this same shape; nothing in
// processDueMessages needs to change when that happens.
export interface CommsSender {
  send(msg: {
    channel: string;
    toPhone: string;
    body: string;
    kind: string;
    bookingId?: string;
  }): Promise<{ ok: boolean; providerRef?: string }>;
}

// Stand-in sender: no external provider is wired up yet (that's Stage 6).
// It just logs the outbound message and reports success with a synthetic
// providerRef, so the rest of the pipeline (status flips, CommunicationLog)
// can be exercised end-to-end today.
export const stubSender: CommsSender = {
  async send(msg) {
    const providerRef = `stub-${Math.random().toString(36).slice(2, 10)}`;
    console.info(`[stubSender] ${msg.channel} -> ${msg.toPhone} (${msg.kind}): ${msg.body}`);
    return { ok: true, providerRef };
  },
};

// Simple bilingual (en/ar) plain-text templates per message kind. Payload
// fields are used opportunistically when present, but nothing here requires
// them — booking.ts currently schedules messages with just
// {bookingId, serviceId}.
export function renderMessageBody(kind: string, locale: string, payload: Record<string, unknown>): string {
  const isAr = locale.toLowerCase().startsWith("ar");
  const bookingId = typeof payload.bookingId === "string" ? payload.bookingId : undefined;
  const ref = bookingId ? ` (${bookingId})` : "";

  switch (kind) {
    case "CONFIRMATION":
      return isAr
        ? `تم تأكيد حجزك في لونيا${ref}. نتطلع لرؤيتك قريباً.`
        : `Your Lunia booking is confirmed${ref}. We look forward to seeing you.`;
    case "REMINDER_24H":
      return isAr
        ? `تذكير: موعدك في لونيا غداً${ref}. نراك قريباً!`
        : `Reminder: your Lunia appointment is tomorrow${ref}. See you soon!`;
    case "POST_VISIT":
      return isAr
        ? `شكراً لزيارتك لونيا${ref}. نتمنى أن تكون تجربتك ممتازة.`
        : `Thank you for visiting Lunia${ref}. We hope you had a great experience.`;
    default:
      return isAr ? `رسالة من لونيا${ref}.` : `A message from Lunia${ref}.`;
  }
}

// Maps the configured comms provider to the channel processDueMessages
// renders/sends on. meta_whatsapp and twilio are WhatsApp-first providers;
// unifonic is SMS-only. "none" (no provider configured, e.g. local dev/CI)
// defaults to "whatsapp" -- harmless, since stubSender doesn't care and
// renderTemplate/renderMessageBody render fine for either channel. A
// twilio-configured-for-SMS nuance is out of scope here.
function channelForProvider(provider: ReturnType<typeof getCommsConfig>["provider"]): string {
  switch (provider) {
    case "unifonic":
      return "sms";
    case "meta_whatsapp":
    case "twilio":
    case "none":
    default:
      return "whatsapp";
  }
}

// Coerces a ScheduledMessage.payload (free-form JSON) into the
// Record<string, string> shape renderTemplate's {{token}} interpolation
// expects. Non-string values (numbers, booleans) are stringified; nullish
// values are dropped so interpolate() falls back to "" for them, same as a
// missing key.
function payloadToParams(payload: Record<string, unknown>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;
    params[key] = typeof value === "string" ? value : String(value);
  }
  return params;
}

const DEFAULT_BATCH_SIZE = 100;

// Fetches due (status=PENDING, sendAt<=now) ScheduledMessage rows in a
// bounded batch, attempts delivery through `sender` for each, and records
// the outcome. Only PENDING rows are selected and each is flipped away from
// PENDING before the next run could see it, so re-running this against the
// same `now` (or a later one) never resends an already-SENT/FAILED message.
// A single message's send failing (rejected promise or {ok:false}) is
// caught per-message and never aborts the rest of the batch.
export async function processDueMessages(
  now: Date,
  sender: CommsSender = stubSender,
): Promise<{ processed: number; sent: number; failed: number }> {
  const due = await prisma.scheduledMessage.findMany({
    where: { status: "PENDING", sendAt: { lte: now } },
    orderBy: { sendAt: "asc" },
    take: DEFAULT_BATCH_SIZE,
  });

  let sent = 0;
  let failed = 0;
  const channel = channelForProvider(getCommsConfig().provider);

  for (const message of due) {
    // Rendering does Prisma reads (template lookup), so keep it INSIDE the
    // per-message try: a transient DB error while rendering one message must
    // mark that message FAILED, not abort the whole batch.
    let body = "";
    try {
      const payload = (message.payload ?? {}) as Record<string, unknown>;
      const params = payloadToParams(payload);
      ({ body } = await renderTemplate(message.kind, message.locale, channel, params));

      const result = await sender.send({
        channel,
        toPhone: message.toPhone,
        body,
        kind: message.kind,
        bookingId: message.bookingId ?? undefined,
      });

      if (result.ok) {
        await prisma.$transaction([
          prisma.scheduledMessage.update({
            where: { id: message.id },
            data: { status: "SENT", sentAt: now },
          }),
          prisma.communicationLog.create({
            data: {
              channel,
              kind: message.kind,
              toPhone: message.toPhone,
              bookingId: message.bookingId ?? null,
              status: "SENT",
              body,
              providerRef: result.providerRef ?? null,
            },
          }),
        ]);
        sent += 1;
      } else {
        await prisma.$transaction([
          prisma.scheduledMessage.update({
            where: { id: message.id },
            data: { status: "FAILED" },
          }),
          prisma.communicationLog.create({
            data: {
              channel,
              kind: message.kind,
              toPhone: message.toPhone,
              bookingId: message.bookingId ?? null,
              status: "FAILED",
              body,
              providerRef: result.providerRef ?? null,
            },
          }),
        ]);
        failed += 1;
      }
    } catch (err) {
      failed += 1;
      try {
        await prisma.$transaction([
          prisma.scheduledMessage.update({
            where: { id: message.id },
            data: { status: "FAILED" },
          }),
          prisma.communicationLog.create({
            data: {
              channel,
              kind: message.kind,
              toPhone: message.toPhone,
              bookingId: message.bookingId ?? null,
              status: "FAILED",
              body,
              providerRef: null,
            },
          }),
        ]);
      } catch (persistErr) {
        // Persisting the failure itself failed (e.g. transient DB issue) —
        // log and move on rather than aborting the batch.
        console.error("[processDueMessages] failed to record failure for message", message.id, persistErr);
      }
      console.error("[processDueMessages] sender threw for message", message.id, err);
    }
  }

  return { processed: due.length, sent, failed };
}
