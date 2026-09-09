// Outbox for booking-related client messages (WhatsApp/SMS confirmations,
// reminders, post-visit follow-ups). scheduleMessage() inserts PENDING
// ScheduledMessage rows (Task 3's booking service calls this). This module
// also implements the delivery side: processDueMessages() picks up due
// PENDING rows, renders a message body, hands it to a CommsSender, and
// records the outcome (ScheduledMessage status flip + a CommunicationLog
// row). The CommsSender used here (stubSender) is a stand-in that only logs
// — Stage 6 wires a real WhatsApp/SMS provider behind the same interface.

import { randomUUID } from "crypto";
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

// A single outbound message. Channel-agnostic: phone channels (whatsapp/sms)
// read toPhone; the email channel reads toEmail + subject. A given send only
// populates the fields its channel needs.
export interface CommsMessage {
  channel: string;
  toPhone?: string;
  toEmail?: string;
  subject?: string;
  body: string;
  kind: string;
  bookingId?: string;
}

// The interface a message-sending provider implements (WhatsApp/SMS/email).
// processDueMessages and the OTP flow send through this same shape.
export interface CommsSender {
  send(msg: CommsMessage): Promise<{ ok: boolean; providerRef?: string }>;
}

// Stand-in sender: logs the outbound message and reports success with a
// synthetic providerRef, so the pipeline (status flips, CommunicationLog) can
// be exercised without a real provider. Used everywhere outside a configured
// production environment.
export const stubSender: CommsSender = {
  async send(msg) {
    const providerRef = `stub-${Math.random().toString(36).slice(2, 10)}`;
    const recipient = msg.toEmail ?? msg.toPhone ?? "?";
    console.info(`[stubSender] ${msg.channel} -> ${recipient} (${msg.kind}): ${msg.body}`);
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

// Resolves the channel processDueMessages renders/sends booking messages on.
// An explicit config.bookingChannel wins (e.g. a Twilio account provisioned
// for SMS rather than WhatsApp sets COMMS_BOOKING_CHANNEL=sms). Otherwise it
// derives from the provider: unifonic is SMS-only; meta_whatsapp/twilio are
// WhatsApp-first; "none" (local dev/CI) defaults to "whatsapp" -- harmless,
// since stubSender doesn't care and templates render fine for either channel.
export function resolveBookingChannel(config: ReturnType<typeof getCommsConfig>): string {
  if (config.bookingChannel) return config.bookingChannel;
  switch (config.provider) {
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

// A SENDING row whose claim is older than this is considered abandoned (the
// worker that claimed it crashed mid-send) and is returned to PENDING by
// reclaimStaleClaims so it gets another delivery attempt.
const STALE_CLAIM_MS = 5 * 60_000;

// Returns abandoned SENDING rows (claimedAt older than `olderThanMs`) to
// PENDING so a crashed worker's in-flight batch is retried rather than stuck.
// Returns the number of rows reclaimed. Call it at the top of each worker
// tick, before processDueMessages.
export async function reclaimStaleClaims(now: Date, olderThanMs: number = STALE_CLAIM_MS): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanMs);
  const { count } = await prisma.scheduledMessage.updateMany({
    where: { status: "SENDING", claimedAt: { lt: cutoff } },
    data: { status: "PENDING", claimId: null, claimedAt: null },
  });
  return count;
}

// Terminal write scoped to the winning claim: only the worker that still owns
// the row (its claimId still matches) flips the status and writes the
// CommunicationLog. If the row was reclaimed by reclaimStaleClaims and
// re-sent by another replica in the interim, the updateMany matches zero rows
// and this is a no-op (no duplicate log, no status clobber). Returns true iff
// this worker owned and finalized the row. Both writes share one transaction.
async function finalizeMessage(
  message: ScheduledMessage,
  status: "SENT" | "FAILED",
  opts: { channel: string; body: string; providerRef?: string; now: Date },
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const res = await tx.scheduledMessage.updateMany({
      where: { id: message.id, claimId: message.claimId },
      data: {
        status,
        sentAt: status === "SENT" ? opts.now : undefined,
        claimId: null,
        claimedAt: null,
      },
    });
    if (res.count !== 1) return false;
    await tx.communicationLog.create({
      data: {
        channel: opts.channel,
        kind: message.kind,
        toPhone: message.toPhone,
        bookingId: message.bookingId ?? null,
        status,
        body: opts.body,
        providerRef: opts.providerRef ?? null,
      },
    });
    return true;
  });
}

// Fetches due (status=PENDING, sendAt<=now) ScheduledMessage rows in a
// bounded batch, ATOMICALLY claims them (PENDING -> SENDING with a unique
// claimId) so concurrent worker replicas never process the same row, attempts
// delivery through `sender` for each claimed row, and records the outcome.
// Because the claim is a conditional updateMany on status=PENDING, only one
// caller wins each row; re-running against the same `now` (or a later one)
// never resends an already-SENT/FAILED message. A single message's send
// failing (rejected promise or {ok:false}) is caught per-message and never
// aborts the rest of the batch.
export async function processDueMessages(
  now: Date,
  sender: CommsSender = stubSender,
): Promise<{ processed: number; sent: number; failed: number }> {
  // Step 1: pick candidate ids. Step 2: claim them conditionally on still
  // being PENDING (the race-safe step). Step 3: read back exactly the rows
  // this call won by its unique claimId.
  const candidates = await prisma.scheduledMessage.findMany({
    where: { status: "PENDING", sendAt: { lte: now } },
    orderBy: { sendAt: "asc" },
    take: DEFAULT_BATCH_SIZE,
    select: { id: true },
  });

  let due: ScheduledMessage[] = [];
  if (candidates.length > 0) {
    const claimId = randomUUID();
    await prisma.scheduledMessage.updateMany({
      where: { id: { in: candidates.map((c) => c.id) }, status: "PENDING" },
      data: { status: "SENDING", claimId, claimedAt: now },
    });
    due = await prisma.scheduledMessage.findMany({
      where: { claimId },
      orderBy: { sendAt: "asc" },
    });
  }

  let sent = 0;
  let failed = 0;
  const channel = resolveBookingChannel(getCommsConfig());

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

      const finalized = await finalizeMessage(message, result.ok ? "SENT" : "FAILED", {
        channel,
        body,
        providerRef: result.providerRef,
        now,
      });
      // Only count the outcome if THIS worker still owned the claim. If it was
      // reclaimed and re-sent by another replica, finalizeMessage no-ops and
      // that replica counts + logs it instead (no duplicate log / status
      // clobber).
      if (finalized) {
        if (result.ok) sent += 1;
        else failed += 1;
      }
    } catch (err) {
      try {
        const finalized = await finalizeMessage(message, "FAILED", { channel, body, providerRef: undefined, now });
        if (finalized) failed += 1;
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
