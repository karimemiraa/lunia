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
import { getPreference, resolveDeliveryChannel } from "@/modules/comms/preferences";
// NOTE: sender.ts imports { stubSender, CommsSender } from THIS file — a
// circular import. Safe: resolveSenderForChannel is only referenced inside
// processDueMessages (a function body), never at module-eval time, so the
// live ESM binding is resolved at call time. Same pattern as the templates.ts
// cycle above.
import { resolveSenderForChannel } from "@/modules/comms/sender";

const msgKindSchema = z.enum(["CONFIRMATION", "REMINDER_24H", "POST_VISIT", "WAITLIST_OPEN", "REVIEW_REQUEST"]);
export type MsgKind = z.infer<typeof msgKindSchema>;

// Payload is a free-form JSON object (message-template data); Prisma's Json
// column accepts any JSON-serializable value, which z.unknown() can't
// statically prove, so the create() call below narrows it with a single
// justified cast.
const scheduleMessageSchema = z
  .object({
    bookingId: z.string().min(1).optional(),
    kind: msgKindSchema,
    toPhone: z.string().min(1).optional(),
    toEmail: z.string().min(1).optional(),
    clientProfileId: z.string().min(1).optional(),
    locale: z.string().min(1),
    sendAt: z.date(),
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  // A message needs at least one recipient to be deliverable on some channel.
  .refine((v) => Boolean(v.toPhone || v.toEmail), {
    message: "scheduleMessage requires toPhone or toEmail",
  });
export type ScheduleMessageInput = z.infer<typeof scheduleMessageSchema>;

// Validates `input` and inserts a PENDING ScheduledMessage row.
export async function scheduleMessage(input: ScheduleMessageInput): Promise<ScheduledMessage> {
  const data = scheduleMessageSchema.parse(input);
  return prisma.scheduledMessage.create({
    data: {
      bookingId: data.bookingId ?? null,
      kind: data.kind,
      toPhone: data.toPhone ?? null,
      toEmail: data.toEmail ?? null,
      clientProfileId: data.clientProfileId ?? null,
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
    case "OTP": {
      // MUST include the code: this built-in is the last-resort fallback when
      // no MessageTemplate row exists for the (kind, locale, channel) — e.g.
      // the email channel, which has no seeded OTP template. A code-less OTP
      // body would make email/SMS login impossible in production (where the
      // dev devCode is not returned).
      const code = typeof payload.code === "string" ? payload.code : "";
      return isAr
        ? `رمز الدخول إلى لونيا هو ${code}. صالح لمدة ٥ دقائق.`
        : `Your Lunia verification code is ${code}. It is valid for 5 minutes.`;
    }
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
    case "WAITLIST_OPEN":
      return isAr
        ? `تفتح لديك فرصة حجز في لونيا -- تم فتح موعد كنت بانتظاره. احجز الآن قبل أن يُحجز.`
        : `A spot just opened up at Lunia for a time you were waiting for. Book now before it's taken.`;
    case "REVIEW_REQUEST": {
      // The tokenized submit link -- reviews.ts always sets payload.link, but
      // this fallback renders sensibly (dropping the link) even if it's ever
      // missing, rather than leaking a literal "{{link}}" token.
      const link = typeof payload.link === "string" ? payload.link : "";
      const linkPartAr = link ? ` ${link}` : "";
      const linkPartEn = link ? ` ${link}` : "";
      return isAr
        ? `شكراً لزيارتك لونيا${ref}. نسعد بمشاركتك رأيك:${linkPartAr}`
        : `Thank you for visiting Lunia${ref}. We'd love to hear about your experience:${linkPartEn}`;
    }
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
  opts: { channel: string; toPhone?: string | null; toEmail?: string | null; body: string; providerRef?: string; now: Date },
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
        toPhone: opts.toPhone ?? null,
        toEmail: opts.toEmail ?? null,
        bookingId: message.bookingId ?? null,
        status,
        body: opts.body,
        providerRef: opts.providerRef ?? null,
      },
    });
    return true;
  });
}

// Marks a message SKIPPED (client opted out of this kind) — claim-scoped like
// finalizeMessage, but writes no CommunicationLog since nothing was sent.
async function finalizeSkipped(message: ScheduledMessage): Promise<boolean> {
  const res = await prisma.scheduledMessage.updateMany({
    where: { id: message.id, claimId: message.claimId },
    data: { status: "SKIPPED", claimId: null, claimedAt: null },
  });
  return res.count === 1;
}

// Whether the client has opted out of this (non-transactional) message kind.
function isOptedOut(kind: string, pref: { remindersOptIn: boolean; postVisitOptIn: boolean } | null): boolean {
  if (!pref) return false;
  if (kind === "REMINDER_24H") return !pref.remindersOptIn;
  // A review request is inherently a post-visit follow-up, so it shares
  // POST_VISIT's opt-in flag rather than needing a dedicated one.
  if (kind === "POST_VISIT" || kind === "REVIEW_REQUEST") return !pref.postVisitOptIn;
  return false;
}

// Chooses the delivery channel + matching recipient for a message, honoring
// the client's preference and falling back to whichever recipient exists.
// Returns null when the message has no usable recipient (marked FAILED).
function pickChannelAndRecipient(
  message: ScheduledMessage,
  pref: { channel: import("@prisma/client").CommsChannelPref } | null,
  globalDefault: string,
): { channel: string; toPhone?: string; toEmail?: string } | null {
  const desired = resolveDeliveryChannel({
    preferenceChannel: pref?.channel,
    globalDefault: globalDefault as "whatsapp" | "sms" | "email",
  });
  if (desired === "email" && message.toEmail) return { channel: "email", toEmail: message.toEmail };
  if ((desired === "sms" || desired === "whatsapp") && message.toPhone) return { channel: desired, toPhone: message.toPhone };
  // Desired channel has no recipient — fall back to whatever we do have.
  if (message.toEmail) return { channel: "email", toEmail: message.toEmail };
  if (message.toPhone) return { channel: globalDefault, toPhone: message.toPhone };
  return null;
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
  senderOverride?: CommsSender,
): Promise<{ processed: number; sent: number; failed: number; skipped: number }> {
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
  let skipped = 0;
  const globalDefault = resolveBookingChannel(getCommsConfig());

  for (const message of due) {
    // Rendering does Prisma reads (template lookup), so keep it INSIDE the
    // per-message try: a transient DB error while rendering one message must
    // mark that message FAILED, not abort the whole batch.
    let channel = globalDefault;
    let body = "";
    try {
      // Consult the client's notification preference (if the message is linked
      // to a client): skip an opted-out kind, and route to their channel.
      const pref = message.clientProfileId ? await getPreference(message.clientProfileId) : null;

      if (isOptedOut(message.kind, pref)) {
        if (await finalizeSkipped(message)) skipped += 1;
        continue;
      }

      const routed = pickChannelAndRecipient(message, pref, globalDefault);
      if (!routed) {
        // No usable recipient — record FAILED so it isn't retried forever.
        if (await finalizeMessage(message, "FAILED", { channel, body: "", now })) failed += 1;
        continue;
      }
      channel = routed.channel;

      const payload = (message.payload ?? {}) as Record<string, unknown>;
      const params = payloadToParams(payload);
      ({ body } = await renderTemplate(message.kind, message.locale, channel, params));

      // Use the injected sender when provided (tests); otherwise resolve the
      // real/stub sender for the resolved channel.
      const activeSender = senderOverride ?? resolveSenderForChannel(channel);
      const result = await activeSender.send({
        channel,
        toPhone: routed.toPhone,
        toEmail: routed.toEmail,
        subject: routed.channel === "email" ? subjectForKind(message.kind, message.locale) : undefined,
        body,
        kind: message.kind,
        bookingId: message.bookingId ?? undefined,
      });

      const finalized = await finalizeMessage(message, result.ok ? "SENT" : "FAILED", {
        channel,
        toPhone: routed.toPhone,
        toEmail: routed.toEmail,
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

  return { processed: due.length, sent, failed, skipped };
}

// A short, human subject line for an email OTP/notification, per kind + locale.
function subjectForKind(kind: string, locale: string): string {
  const isAr = locale.toLowerCase().startsWith("ar");
  switch (kind) {
    case "OTP":
      return isAr ? "رمز الدخول إلى لونيا" : "Your Lunia code";
    case "CONFIRMATION":
      return isAr ? "تأكيد حجزك في لونيا" : "Your Lunia booking is confirmed";
    case "REMINDER_24H":
      return isAr ? "تذكير بموعدك في لونيا" : "Your Lunia appointment reminder";
    case "POST_VISIT":
      return isAr ? "شكراً لزيارتك لونيا" : "Thank you for visiting Lunia";
    case "WAITLIST_OPEN":
      return isAr ? "فتح موعد كنت بانتظاره في لونيا" : "A spot opened up at Lunia";
    case "REVIEW_REQUEST":
      return isAr ? "شاركينا رأيك في زيارتك لونيا" : "Share your Lunia experience";
    default:
      return "Lunia";
  }
}
