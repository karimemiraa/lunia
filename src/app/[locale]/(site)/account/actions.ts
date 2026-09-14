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
import { getBooking, cancel } from "@/modules/booking/bookings";
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
