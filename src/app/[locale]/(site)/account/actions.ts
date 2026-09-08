"use server";

// Server actions for the signed-in client account area: cancel-my-booking
// and logout. Both re-derive the caller's identity from the
// `lunia_client_session` cookie server-side — nothing here trusts a
// client-supplied clientProfileId or userId.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { getBooking, cancel } from "@/modules/booking/bookings";
import { getClientSessionUser, destroyClientSession, CLIENT_SESSION_COOKIE } from "@/modules/iam/clientAuth";

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
