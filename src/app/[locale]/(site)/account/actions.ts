"use server";

// Server actions for the signed-in client account area: cancel-my-booking
// and logout. Both re-derive the caller's identity from the
// `lunia_client_session` cookie server-side — nothing here trusts a
// client-supplied clientProfileId or userId.

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { getBooking, cancel, getServiceSlots, reschedule } from "@/modules/booking/bookings";
import { utcToCenterLocal } from "@/modules/booking/availability";
import {
  getClientSessionUser,
  destroyClientSession,
  setClientPassword,
  MIN_CLIENT_PASSWORD_LENGTH,
  CLIENT_SESSION_COOKIE,
} from "@/modules/iam/clientAuth";
import { upsertPreference } from "@/modules/comms/preferences";
import type { CommsChannelPref } from "@prisma/client";

type AccountLocale = "en" | "ar";

function asAccountLocale(locale: string): AccountLocale {
  return locale === "ar" ? "ar" : "en";
}

const MIN_HOURS_BEFORE_CANCEL = 24;

async function requireClientProfileId(): Promise<string | null> {
  const token = (await cookies()).get(CLIENT_SESSION_COOKIE)?.value;
  if (!token) return null;
  const sessionUser = await getClientSessionUser(token);
  if (!sessionUser) return null;
  const profile = await prisma.clientProfile.findUnique({ where: { userId: sessionUser.id } });
  return profile?.id ?? null;
}

async function requireClientUserId(): Promise<string | null> {
  const token = (await cookies()).get(CLIENT_SESSION_COOKIE)?.value;
  if (!token) return null;
  const sessionUser = await getClientSessionUser(token);
  return sessionUser?.id ?? null;
}

export type CancelBookingResult = { ok: true } | { ok: false; error: string };

// Cancels a booking on behalf of the signed-in client. SECURITY: this is the
// only place a client can trigger a cancellation, so it re-verifies both
// that a valid client session exists AND that the booking being cancelled
// actually belongs to *that* client's profile (booking.clientProfileId must
// match) before ever calling the underlying cancel() — a bookingId alone is
// never sufficient. Also enforces the >24h cancellation window.
export async function cancelMyBooking(bookingId: string, locale: string): Promise<CancelBookingResult> {
  const t = await getTranslations({ locale: asAccountLocale(locale), namespace: "account.errors" });

  const clientProfileId = await requireClientProfileId();
  if (!clientProfileId) {
    return { ok: false, error: t("notAuthenticated") };
  }

  const booking = await getBooking(bookingId);
  if (!booking || booking.clientProfileId !== clientProfileId) {
    // Either the booking doesn't exist, or it belongs to someone else — in
    // both cases we report the same "not found" error so we never confirm
    // to a caller which bookingIds exist for other clients.
    return { ok: false, error: t("notFound") };
  }

  const appointment = booking.appointments[0];
  if (!appointment) {
    return { ok: false, error: t("notFound") };
  }

  const hoursUntilStart = (appointment.startAt.getTime() - Date.now()) / (60 * 60 * 1000);
  if (hoursUntilStart < MIN_HOURS_BEFORE_CANCEL) {
    return { ok: false, error: t("tooLateToCancel") };
  }

  try {
    await cancel(bookingId);
  } catch {
    return { ok: false, error: t("generic") };
  }

  return { ok: true };
}

// ---- Self-service reschedule ------------------------------------------------
// Same policy as cancelling: the client's own booking, still upcoming, and
// more than MIN_HOURS_BEFORE_CANCEL hours away. The new time must be a slot
// the live availability engine offers right now (re-checked again inside
// reschedule()'s serializable transaction). The same specialist is kept when
// they're free at the new time.

const MAX_RESCHEDULE_DAYS_AHEAD = 60;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

async function ownReschedulableBooking(bookingId: string, locale: string) {
  const t = await getTranslations({ locale: asAccountLocale(locale), namespace: "account.errors" });
  const clientProfileId = await requireClientProfileId();
  if (!clientProfileId) return { error: t("notAuthenticated") } as const;
  const booking = await getBooking(bookingId);
  if (!booking || booking.clientProfileId !== clientProfileId) return { error: t("notFound") } as const;
  const appointment = booking.appointments[0];
  if (!appointment || (booking.status !== "CONFIRMED" && booking.status !== "REQUESTED")) return { error: t("notFound") } as const;
  if ((appointment.startAt.getTime() - Date.now()) / 3_600_000 < MIN_HOURS_BEFORE_CANCEL) return { error: t("tooLateToReschedule") } as const;
  return { booking, appointment, t } as const;
}

function inWindow(dateISO: string): boolean {
  if (!DATE_ISO.test(dateISO)) return false;
  const today = utcToCenterLocal(new Date()).dateISO;
  const last = utcToCenterLocal(new Date(Date.now() + MAX_RESCHEDULE_DAYS_AHEAD * 86_400_000)).dateISO;
  return dateISO >= today && dateISO <= last;
}

export type RescheduleSlotsResult = { ok: true; times: { startAtIso: string; label: string }[] } | { ok: false; error: string };

export async function getMyRescheduleSlots(bookingId: string, dateISO: string, locale: string): Promise<RescheduleSlotsResult> {
  const own = await ownReschedulableBooking(bookingId, locale);
  if ("error" in own) return { ok: false, error: own.error! };
  if (!inWindow(dateISO)) return { ok: true, times: [] };
  try {
    const slots = await getServiceSlots(own.appointment.serviceId, dateISO, own.appointment.id);
    const minStart = Date.now() + MIN_HOURS_BEFORE_CANCEL * 3_600_000;
    const byTime = new Map<number, string>();
    for (const slot of slots) if (slot.startAt.getTime() >= minStart && slot.startAt.getTime() !== own.appointment.startAt.getTime()) byTime.set(slot.startAt.getTime(), slot.startAt.toISOString());
    const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit" });
    return {
      ok: true,
      times: [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([ms, iso]) => ({ startAtIso: iso, label: fmt.format(new Date(ms)) })),
    };
  } catch {
    return { ok: false, error: own.t("generic") };
  }
}

export type RescheduleBookingResult = { ok: true } | { ok: false; error: string };

export async function rescheduleMyBooking(bookingId: string, newStartAtIso: string, locale: string): Promise<RescheduleBookingResult> {
  const own = await ownReschedulableBooking(bookingId, locale);
  if ("error" in own) return { ok: false, error: own.error! };
  const newStart = new Date(newStartAtIso);
  if (Number.isNaN(newStart.getTime())) return { ok: false, error: own.t("generic") };
  const dateISO = utcToCenterLocal(newStart).dateISO;
  if (!inWindow(dateISO) || newStart.getTime() < Date.now() + MIN_HOURS_BEFORE_CANCEL * 3_600_000) return { ok: false, error: own.t("slotUnavailable") };

  const slots = await getServiceSlots(own.appointment.serviceId, dateISO, own.appointment.id).catch(() => []);
  const atTime = slots.filter((s) => s.startAt.getTime() === newStart.getTime());
  if (atTime.length === 0) return { ok: false, error: own.t("slotUnavailable") };
  const sameStaff = atTime.find((s) => s.staffUserId === own.appointment.staffUserId);
  const pick = sameStaff ?? atTime[0]!;
  try {
    await reschedule(bookingId, newStart, pick.staffUserId, pick.roomId);
  } catch {
    return { ok: false, error: own.t("slotUnavailable") };
  }
  return { ok: true };
}

export async function logout(locale: string): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CLIENT_SESSION_COOKIE)?.value;
  if (token) {
    await destroyClientSession(token);
  }
  cookieStore.delete(CLIENT_SESSION_COOKIE);
  redirect(`/${asAccountLocale(locale)}`);
}

export type UpdateNotificationPreferenceResult = { ok: true } | { ok: false; error: string };

const notificationPreferenceSchema = z.object({
  channel: z.enum(["AUTO", "WHATSAPP", "SMS", "EMAIL"]),
  remindersOptIn: z.boolean(),
  postVisitOptIn: z.boolean(),
  marketingOptIn: z.boolean(),
});
export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceSchema>;

// Updates the signed-in client's own NotificationPreference (channel +
// opt-ins). Like cancelMyBooking above, this re-derives the client's
// identity from the session cookie — it never trusts a client-supplied
// clientProfileId — so a client can only ever edit their own preference.
//
// FOLLOW-UP (documented, out of scope for this task): this panel only
// covers channel + opt-in toggles. Letting a phone-first client attach an
// email (or vice versa) — which requires verifying the new identifier by
// OTP before attaching it — is intentionally not implemented here; see the
// engagement spec (docs/superpowers/specs/2026-09-09-lunia-engagement-design.md
// section 2) for that follow-up.
export async function updateNotificationPreference(
  input: NotificationPreferenceInput,
  locale: string,
): Promise<UpdateNotificationPreferenceResult> {
  const t = await getTranslations({ locale: asAccountLocale(locale), namespace: "account.notifications.errors" });

  const clientProfileId = await requireClientProfileId();
  if (!clientProfileId) {
    return { ok: false, error: t("notAuthenticated") };
  }

  try {
    const data = notificationPreferenceSchema.parse(input);
    await upsertPreference(clientProfileId, {
      channel: data.channel as CommsChannelPref,
      remindersOptIn: data.remindersOptIn,
      postVisitOptIn: data.postVisitOptIn,
      marketingOptIn: data.marketingOptIn,
    });
  } catch {
    return { ok: false, error: t("generic") };
  }

  return { ok: true };
}

export type AccountActionResult = { ok: true } | { ok: false; error: string };

const nameSchema = z.string().trim().min(1).max(120);

// Updates the signed-in client's own display name (used to personalize their
// emails). Identity is re-derived from the session cookie.
export async function updateMyName(nameRaw: string, locale: string): Promise<AccountActionResult> {
  const t = await getTranslations({ locale: asAccountLocale(locale), namespace: "account.security.errors" });
  const clientProfileId = await requireClientProfileId();
  if (!clientProfileId) return { ok: false, error: t("notAuthenticated") };

  const parsed = nameSchema.safeParse(nameRaw);
  if (!parsed.success) return { ok: false, error: t("invalidName") };

  try {
    await prisma.clientProfile.update({ where: { id: clientProfileId }, data: { fullName: parsed.data } });
  } catch {
    return { ok: false, error: t("generic") };
  }
  return { ok: true };
}

const bookingNoteSchema = z.string().trim().max(1000);

// Saves the signed-in client's own note on one of THEIR bookings
// (Booking.customerNote — visible to staff in the day view). SECURITY: like
// cancelMyBooking, it re-derives the client from the session cookie and
// verifies the booking belongs to that client before writing; a bookingId
// alone is never sufficient. An empty string clears the note.
export async function updateMyBookingNote(bookingId: string, noteRaw: string, locale: string): Promise<AccountActionResult> {
  const t = await getTranslations({ locale: asAccountLocale(locale), namespace: "account.errors" });
  const clientProfileId = await requireClientProfileId();
  if (!clientProfileId) return { ok: false, error: t("notAuthenticated") };

  const booking = await getBooking(bookingId);
  if (!booking || booking.clientProfileId !== clientProfileId) {
    return { ok: false, error: t("notFound") };
  }

  const parsed = bookingNoteSchema.safeParse(noteRaw);
  if (!parsed.success) return { ok: false, error: t("generic") };

  try {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { customerNote: parsed.data.length > 0 ? parsed.data : null },
    });
  } catch {
    return { ok: false, error: t("generic") };
  }
  return { ok: true };
}

// Sets (or replaces) the signed-in client's login password. Identity is
// re-derived from the session cookie — a client can only set their own.
export async function setMyPassword(newPassword: string, locale: string): Promise<AccountActionResult> {
  const t = await getTranslations({ locale: asAccountLocale(locale), namespace: "account.security.errors" });
  const userId = await requireClientUserId();
  if (!userId) return { ok: false, error: t("notAuthenticated") };

  if (typeof newPassword !== "string" || newPassword.length < MIN_CLIENT_PASSWORD_LENGTH) {
    return { ok: false, error: t("passwordTooShort", { min: MIN_CLIENT_PASSWORD_LENGTH }) };
  }

  try {
    await setClientPassword(userId, newPassword);
  } catch {
    return { ok: false, error: t("generic") };
  }
  return { ok: true };
}
