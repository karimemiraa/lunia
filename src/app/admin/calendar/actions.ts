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
import { checkIn, complete, cancel, markNoShow, reschedule, createBooking, getServiceSlots } from "@/modules/booking/bookings";

export type ActionResult = { ok: true } | { ok: false; error: string };

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

function revalidateCalendar(): void {
  revalidatePath("/admin/calendar");
}

export async function checkInAction(bookingId: string): Promise<ActionResult> {
  await requireAdmin(PERMISSIONS.BOOKING_MANAGE);
  try {
    await checkIn(bookingId);
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
  revalidateCalendar();
  return { ok: true };
}

export async function completeAction(bookingId: string): Promise<ActionResult> {
  await requireAdmin(PERMISSIONS.BOOKING_MANAGE);
  try {
    await complete(bookingId);
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
  revalidateCalendar();
  return { ok: true };
}

export async function cancelAction(bookingId: string): Promise<ActionResult> {
  await requireAdmin(PERMISSIONS.BOOKING_MANAGE);
  try {
    await cancel(bookingId);
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
  revalidateCalendar();
  return { ok: true };
}

export async function noShowAction(bookingId: string): Promise<ActionResult> {
  await requireAdmin(PERMISSIONS.BOOKING_MANAGE);
  try {
    await markNoShow(bookingId);
  } catch (err) {
    return { ok: false, error: messageOf(err) };
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
    return { ok: false, error: messageOf(err) };
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
    return { ok: false, error: messageOf(err) };
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
    return { ok: false, error: "Service, time, and client name and phone are required." };
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
    return { ok: false, error: messageOf(err) };
  }
  revalidateCalendar();
  return { ok: true };
}
