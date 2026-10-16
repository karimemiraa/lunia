"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { getStaffLocale, getStaffT } from "../_i18n/display";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { prisma } from "@/lib/db";
import { checkIn, complete } from "@/modules/booking/bookings";
import {
  receive, startTreatment, finishTreatment, overridePayment, markHospitality, reassign,
  availableSpecialists, markRoomReady, waitingForStaff, JourneyError,
} from "@/modules/booking/journey";

export interface JourneyActionResult {
  ok: boolean;
  error?: string;
}

function refresh() {
  revalidatePath("/admin/visits");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
}

async function fail(err: unknown): Promise<JourneyActionResult> {
  const t = await getStaffT();
  if (!(err instanceof JourneyError)) console.error("[visits] action failed", err);
  return { ok: false, error: err instanceof Error ? t(err.message) : t("Something went wrong. Please try again.") };
}

/**
 * Front desk (booking:manage) can move any visit. A specialist can receive,
 * start and finish her own customers even with view-only booking access.
 */
async function authorize(bookingId: string, ownAllowed: boolean) {
  const user = await requireAdmin(PERMISSIONS.BOOKING_VIEW);
  if (user.permissions.has(PERMISSIONS.BOOKING_MANAGE)) return user;
  if (ownAllowed && (await prisma.appointment.count({ where: { bookingId, staffUserId: user.id } })) > 0) return user;
  throw new JourneyError("Only the front desk or this customer's specialist can do that.");
}

async function run(bookingId: string, ownAllowed: boolean, fn: (userId: string) => Promise<unknown>): Promise<JourneyActionResult> {
  try {
    const user = await authorize(bookingId, ownAllowed);
    await fn(user.id);
  } catch (err) {
    return fail(err);
  }
  refresh();
  return { ok: true };
}

export async function checkInVisitAction(bookingId: string) {
  return run(bookingId, false, (u) => checkIn(bookingId, u));
}
export async function receiveAction(bookingId: string, consultation?: boolean) {
  return run(bookingId, true, (u) => receive(bookingId, u, consultation === undefined ? {} : { consultation }));
}
export async function startTreatmentAction(bookingId: string) {
  return run(bookingId, true, (u) => startTreatment(bookingId, u));
}
export async function finishTreatmentAction(bookingId: string) {
  return run(bookingId, true, (u) => finishTreatment(bookingId, u));
}
export async function checkOutAction(bookingId: string) {
  return run(bookingId, false, (u) => complete(bookingId, u));
}
export async function overridePaymentAction(bookingId: string, note: string) {
  return run(bookingId, false, (u) => overridePayment(bookingId, u, note));
}
export async function hospitalityAction(bookingId: string) {
  return run(bookingId, false, (u) => markHospitality(bookingId, u));
}
export async function reassignAction(bookingId: string, staffUserId: string) {
  return run(bookingId, false, (u) => reassign(bookingId, staffUserId, u));
}

export async function availableSpecialistsAction(bookingId: string): Promise<{ id: string; name: string }[]> {
  try {
    await authorize(bookingId, false);
  } catch {
    return [];
  }
  const arabic = (await getStaffLocale()) === "ar";
  return (await availableSpecialists(bookingId)).map((s) => ({ id: s.id, name: (arabic && s.nameAr) || s.name }));
}

export async function roomReadyAction(roomId: string): Promise<JourneyActionResult> {
  await requireAdmin(PERMISSIONS.BOOKING_VIEW);
  try {
    await markRoomReady(roomId);
  } catch (err) {
    return fail(err);
  }
  refresh();
  return { ok: true };
}

/** Polled by the arrival alert: customers waiting for the signed-in specialist. */
export async function myWaitingCustomersAction(): Promise<{ bookingId: string; clientName: string; arrivedAt: string }[]> {
  const user = await requireAdmin(PERMISSIONS.BOOKING_VIEW);
  return waitingForStaff(user.id);
}
