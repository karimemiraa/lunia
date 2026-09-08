// Outbox for booking-related client messages (WhatsApp/SMS confirmations,
// reminders, post-visit follow-ups). This module only inserts PENDING
// ScheduledMessage rows; a later task (Task 6) adds the worker that
// processes them (processDueMessages) and the comms stub that actually
// sends them.

import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma, ScheduledMessage } from "@prisma/client";

const msgKindSchema = z.enum(["CONFIRMATION", "REMINDER_24H", "POST_VISIT"]);

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
