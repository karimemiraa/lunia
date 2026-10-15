"use server";

// Server actions backing the staff calendar (page.tsx) and its client
// components (AppointmentActions, WalkInForm). Every action re-checks
// BOOKING_MANAGE itself (never trusts that the page that rendered the
// button already checked it), and mutations revalidate /admin/calendar so a
// following router.refresh() picks up fresh data.
//
// Actions here take plain, typed parameters (rather than FormData) and are
// invoked directly from client components via useTransition, mirroring the
// public booking wizard's src/app/[locale]/(site)/book/actions.ts.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { checkIn, complete, cancel, markNoShow, reschedule, createBooking, getServiceSlots, startService } from "@/modules/booking/bookings";
import { countWaiting } from "@/modules/booking/waitlist";
import { utcToCenterLocal } from "@/modules/booking/availability";
import { prisma } from "@/lib/db";
import { previewSeries, createSeries, cancelSeriesFrom } from "@/modules/booking/series";
import { getStaffT } from "../_i18n/display";
import { errorText } from "./actionError";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Module errors are English; errorText() returns them in the staff locale.
const messageOf = errorText;

function revalidateCalendar(): void {
  revalidatePath("/admin/calendar");
}

// Saves the staff-authored note shown to the customer on their appointment
// detail page (Booking.centerNote). Empty string clears it.
export async function saveCenterNoteAction(bookingId: string, note: string): Promise<ActionResult> {
  await requireAdmin(PERMISSIONS.BOOKING_MANAGE);
  const trimmed = typeof note === "string" ? note.trim().slice(0, 2000) : "";
  try {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { centerNote: trimmed.length > 0 ? trimmed : null },
    });
  } catch (err) {
    return { ok: false, error: await messageOf(err) };
  }
  revalidateCalendar();
  return { ok: true };
}

export async function checkInAction(bookingId: string): Promise<ActionResult> {
  await requireAdmin(PERMISSIONS.BOOKING_MANAGE);
  try {
    await checkIn(bookingId);
  } catch (err) {
    return { ok: false, error: await messageOf(err) };
  }
  revalidateCalendar();
  return { ok: true };
}

export async function completeAction(bookingId: string): Promise<ActionResult> {
  await requireAdmin(PERMISSIONS.BOOKING_MANAGE);
  try {
    await complete(bookingId);
  } catch (err) {
    return { ok: false, error: await messageOf(err) };
  }
  revalidateCalendar();
  return { ok: true };
}

export type CancelResult = { ok: true; waitlistNotified: number; dateISO: string | null } | { ok: false; error: string };

// Cancelling frees the slot; cancel() itself notifies the waitlist, so we
// count who was WAITING for that service+day just before, and report it so
// the calendar can surface "N people were waiting for this day".
export async function cancelAction(bookingId: string): Promise<CancelResult> {
  await requireAdmin(PERMISSIONS.BOOKING_MANAGE);
  let waiting = 0;
  let dateISO: string | null = null;
  try {
    const appt = await prisma.appointment.findFirst({ where: { bookingId }, select: { serviceId: true, startAt: true } });
    if (appt) {
      dateISO = utcToCenterLocal(appt.startAt).dateISO;
      waiting = await countWaiting(appt.serviceId, dateISO);
    }
    await cancel(bookingId);
  } catch (err) {
    return { ok: false, error: await messageOf(err) };
  }
  revalidateCalendar();
  revalidatePath("/admin/waitlist");
  return { ok: true, waitlistNotified: waiting, dateISO };
}

// "Start": the customer is in the room (CheckIn.seatedAt).
export async function startAction(bookingId: string): Promise<ActionResult> {
  await requireAdmin(PERMISSIONS.BOOKING_MANAGE);
  try {
    await startService(bookingId);
  } catch (err) {
    return { ok: false, error: await messageOf(err) };
  }
  revalidateCalendar();
  return { ok: true };
}

export async function noShowAction(bookingId: string): Promise<ActionResult> {
  await requireAdmin(PERMISSIONS.BOOKING_MANAGE);
  try {
    await markNoShow(bookingId);
  } catch (err) {
    return { ok: false, error: await messageOf(err) };
  }
  revalidateCalendar();
  return { ok: true };
}

// staffUserId/roomId are optional: reschedule() re-resolves a free
// (staff, room) pair from the new time when they're omitted, excluding the
// appointment being moved from its own conflict check (the T3 self-exclusion
// fix in getServiceSlots/reschedule).
export async function rescheduleAction(
  bookingId: string,
  newStartAtISO: string,
  staffUserId?: string,
  roomId?: string,
): Promise<ActionResult> {
  await requireAdmin(PERMISSIONS.BOOKING_MANAGE);
  try {
    await reschedule(bookingId, newStartAtISO, staffUserId, roomId);
  } catch (err) {
    return { ok: false, error: await messageOf(err) };
  }
  revalidateCalendar();
  return { ok: true };
}

export interface CalendarSlotDTO {
  startAt: string;
  staffUserId: string;
  roomId: string;
}

export type GetCalendarSlotsResult = { ok: true; slots: CalendarSlotDTO[] } | { ok: false; error: string };

// Shared slot lookup for both the walk-in form (no exclusion) and the
// reschedule panel (excludes the appointment being moved so its own current
// slot doesn't disappear from the list of options).
export async function getCalendarSlotsAction(
  serviceId: string,
  dateISO: string,
  excludeAppointmentId?: string,
): Promise<GetCalendarSlotsResult> {
  await requireAdmin(PERMISSIONS.BOOKING_MANAGE);
  try {
    const slots = await getServiceSlots(serviceId, dateISO, excludeAppointmentId);
    return {
      ok: true,
      slots: slots.map((slot) => ({ startAt: slot.startAt.toISOString(), staffUserId: slot.staffUserId, roomId: slot.roomId })),
    };
  } catch (err) {
    return { ok: false, error: await messageOf(err) };
  }
}

export interface FrontDeskBookInput {
  serviceId: string;
  startAt: string;
  staffUserId: string;
  roomId: string;
  name: string;
  phone: string;
}

// Front-desk / walk-in booking: channel FRONT_DESK bypasses createBooking's
// ONLINE-only onlineBookable/inCenterOnly gate, so staff can book any
// published service in-center. Double-booking is still prevented by
// createBooking's transactional slot re-check.
export async function frontDeskBookAction(input: FrontDeskBookInput): Promise<ActionResult> {
  const admin = await requireAdmin(PERMISSIONS.BOOKING_MANAGE);

  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!input.serviceId || !input.startAt || !input.staffUserId || !input.roomId || !name || !phone) {
    return { ok: false, error: (await getStaffT())("Service, time, and client name and phone are required.") };
  }

  try {
    await createBooking({
      serviceId: input.serviceId,
      startAt: input.startAt,
      staffUserId: input.staffUserId,
      roomId: input.roomId,
      client: { name, phone },
      channel: "FRONT_DESK",
      createdById: admin.id,
      locale: "en",
    });
  } catch (err) {
    return { ok: false, error: await messageOf(err) };
  }
  revalidateCalendar();
  return { ok: true };
}

// ---- Recurring series ("every N weeks × count") ---------------------------

export interface SeriesPreviewDTO {
  dateISO: string;
  startAt: string;
  available: boolean;
}

export async function previewSeriesAction(input: { serviceId: string; firstStartAt: string; staffUserId?: string; intervalWeeks: number; count: number }): Promise<{ ok: true; occurrences: SeriesPreviewDTO[] } | { ok: false; error: string }> {
  await requireAdmin(PERMISSIONS.BOOKING_MANAGE);
  try {
    const occ = await previewSeries(input);
    return { ok: true, occurrences: occ.map((o) => ({ dateISO: o.dateISO, startAt: o.startAt.toISOString(), available: o.available })) };
  } catch (err) {
    return { ok: false, error: await messageOf(err) };
  }
}

export async function createSeriesAction(input: {
  serviceId: string;
  firstStartAt: string;
  staffUserId?: string;
  intervalWeeks: number;
  count: number;
  name: string;
  phone: string;
}): Promise<{ ok: true; booked: number; skipped: string[] } | { ok: false; error: string }> {
  const admin = await requireAdmin(PERMISSIONS.BOOKING_MANAGE);
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name || !phone) return { ok: false, error: (await getStaffT())("Customer name and phone are required.") };
  try {
    const r = await createSeries({ ...input, client: { name, phone }, createdById: admin.id, locale: "en" });
    revalidateCalendar();
    return { ok: true, booked: r.booked.length, skipped: r.skipped.map((s) => utcToCenterLocal(s.startAt).dateISO) };
  } catch (err) {
    return { ok: false, error: await messageOf(err) };
  }
}

export async function cancelSeriesFromAction(bookingId: string): Promise<{ ok: true; cancelled: number } | { ok: false; error: string }> {
  await requireAdmin(PERMISSIONS.BOOKING_MANAGE);
  try {
    const cancelled = await cancelSeriesFrom(bookingId);
    revalidateCalendar();
    return { ok: true, cancelled };
  } catch (err) {
    return { ok: false, error: await messageOf(err) };
  }
}
