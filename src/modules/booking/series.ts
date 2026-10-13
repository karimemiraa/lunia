// Recurring appointment series ("every 2 weeks × 6"), booked by staff.
// Each occurrence is an ordinary Booking (same checks, reminders, check-in,
// checkout) linked by Booking.seriesId. Dates that aren't free are skipped
// and reported — never double-booked. The customer gets one confirmation for
// the series (later occurrences' confirmation messages are skipped) and the
// usual 24h reminder before every visit.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { utcToCenterLocal } from "./availability";
import { cancel, createBooking, getServiceSlots, type Slot } from "./bookings";

const WEEK_MS = 7 * 86_400_000;

export const seriesSchema = z.object({
  serviceId: z.string().min(1),
  firstStartAt: z.coerce.date(),
  intervalWeeks: z.number().int().min(1).max(12),
  count: z.number().int().min(2).max(26),
  staffUserId: z.string().min(1).optional(),
});
export type SeriesInput = z.input<typeof seriesSchema>;

export interface SeriesOccurrence {
  index: number;
  startAt: Date;
  dateISO: string;
  available: boolean;
  staffUserId?: string;
  roomId?: string;
}

function pick(slots: Slot[], startAt: Date, staffUserId?: string): Slot | undefined {
  const at = slots.filter((s) => s.startAt.getTime() === startAt.getTime());
  return at.find((s) => s.staffUserId === staffUserId) ?? at[0];
}

/** Every date of the series with whether that time is free (same specialist preferred). */
export async function previewSeries(raw: SeriesInput): Promise<SeriesOccurrence[]> {
  const input = seriesSchema.parse(raw);
  const out: SeriesOccurrence[] = [];
  for (let i = 0; i < input.count; i++) {
    const startAt = new Date(input.firstStartAt.getTime() + i * input.intervalWeeks * WEEK_MS);
    const dateISO = utcToCenterLocal(startAt).dateISO;
    const slot = pick(await getServiceSlots(input.serviceId, dateISO).catch(() => []), startAt, input.staffUserId);
    out.push({ index: i, startAt, dateISO, available: !!slot, staffUserId: slot?.staffUserId, roomId: slot?.roomId });
  }
  return out;
}

export interface CreateSeriesResult {
  seriesId: string;
  booked: { bookingId: string; startAt: Date }[];
  skipped: { startAt: Date; reason: string }[];
}

export async function createSeries(
  raw: SeriesInput & { client: { name: string; phone: string }; createdById?: string; locale?: string },
): Promise<CreateSeriesResult> {
  const input = seriesSchema.parse(raw);
  const preview = await previewSeries(input);
  if (!preview[0]?.available) throw new Error("The first appointment's time isn't available any more — pick another time.");

  // Created with the first booked visit (that's when the customer is resolved).
  let seriesId: string | null = null;
  const booked: CreateSeriesResult["booked"] = [];
  const skipped: CreateSeriesResult["skipped"] = [];
  for (const occ of preview) {
    if (!occ.available) {
      skipped.push({ startAt: occ.startAt, reason: "No free specialist or room at that time" });
      continue;
    }
    try {
      const booking = await createBooking({
        serviceId: input.serviceId,
        startAt: occ.startAt,
        staffUserId: occ.staffUserId,
        roomId: occ.roomId,
        client: raw.client,
        channel: "FRONT_DESK",
        createdById: raw.createdById,
        locale: raw.locale ?? "en",
        notes: `Series ${occ.index + 1} of ${input.count}`,
      });
      if (!seriesId) {
        seriesId = (
          await prisma.bookingSeries.create({
            data: { clientProfileId: booking.clientProfileId, serviceId: input.serviceId, intervalWeeks: input.intervalWeeks, count: input.count, createdById: raw.createdById ?? null },
          })
        ).id;
      } else {
        // One confirmation for the whole series (the first booked visit).
        await prisma.scheduledMessage.updateMany({ where: { bookingId: booking.id, kind: "CONFIRMATION", status: "PENDING" }, data: { status: "SKIPPED" } });
      }
      await prisma.booking.update({ where: { id: booking.id }, data: { seriesId } });
      booked.push({ bookingId: booking.id, startAt: occ.startAt });
    } catch (err) {
      skipped.push({ startAt: occ.startAt, reason: err instanceof Error ? err.message : "Could not book" });
    }
  }
  if (!seriesId) throw new Error("None of the dates could be booked.");
  return { seriesId, booked, skipped };
}

/** Position of a booking in its series, for labels like "3 of 6". */
export async function seriesPositions(seriesIds: string[]): Promise<Map<string, { position: number; total: number }>> {
  const out = new Map<string, { position: number; total: number }>();
  if (seriesIds.length === 0) return out;
  const rows = await prisma.booking.findMany({
    where: { seriesId: { in: [...new Set(seriesIds)] } },
    select: { id: true, seriesId: true, appointments: { select: { startAt: true }, take: 1 } },
  });
  const bySeries = new Map<string, { id: string; t: number }[]>();
  for (const r of rows) {
    const list = bySeries.get(r.seriesId!) ?? [];
    list.push({ id: r.id, t: r.appointments[0]?.startAt.getTime() ?? 0 });
    bySeries.set(r.seriesId!, list);
  }
  for (const list of bySeries.values()) {
    list.sort((a, b) => a.t - b.t);
    list.forEach((b, i) => out.set(b.id, { position: i + 1, total: list.length }));
  }
  return out;
}

/** Cancels this booking and every LATER, not-yet-visited booking of its series. */
export async function cancelSeriesFrom(bookingId: string): Promise<number> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { appointments: { take: 1, orderBy: { startAt: "asc" } } } });
  if (!booking?.seriesId) throw new Error("This appointment isn't part of a series.");
  const from = booking.appointments[0]?.startAt ?? new Date();
  const targets = await prisma.booking.findMany({
    where: { seriesId: booking.seriesId, status: { in: ["REQUESTED", "CONFIRMED"] }, appointments: { some: { startAt: { gte: from } } } },
    select: { id: true },
  });
  for (const t of targets) await cancel(t.id);
  return targets.length;
}
