"use server";

// Server actions backing the public booking wizard (BookingWizard.tsx). All
// three are intentionally public (no requireAdmin) — this is the online
// booking funnel — but every input is Zod-validated and none of them trust
// client-supplied price/staff/room: getServiceSlots and createBooking do
// all of that resolution server-side (see src/modules/booking/bookings.ts).
//
// Errors from the underlying modules are plain English `Error.message`
// strings meant for logs/tests, not client-facing bilingual copy, so this
// layer maps known failure modes to translated (book.errors.*) messages
// before they ever reach the client component.

import { z } from "zod";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getServiceSlots, createBooking } from "@/modules/booking/bookings";
import { requestOtp, verifyOtp, createClientSession, CLIENT_SESSION_COOKIE } from "@/modules/iam/clientAuth";

export type BookLocale = "en" | "ar";

function asBookLocale(locale: string): BookLocale {
  return locale === "ar" ? "ar" : "en";
}

async function errorTranslator(locale: string) {
  return getTranslations({ locale: asBookLocale(locale), namespace: "book.errors" });
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface SlotDTO {
  startAt: string;
  staffUserId: string;
  roomId: string;
}

export type GetSlotsResult = { ok: true; slots: SlotDTO[] } | { ok: false; error: string };

const getSlotsSchema = z.object({
  serviceId: z.string().min(1),
  dateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
});

export async function getSlots(serviceId: string, dateISO: string, locale: string): Promise<GetSlotsResult> {
  const t = await errorTranslator(locale);
  try {
    const input = getSlotsSchema.parse({ serviceId, dateISO });
    const slots = await getServiceSlots(input.serviceId, input.dateISO);
    return {
      ok: true,
      slots: slots.map((slot) => ({
        startAt: slot.startAt.toISOString(),
        staffUserId: slot.staffUserId,
        roomId: slot.roomId,
      })),
    };
  } catch {
    return { ok: false, error: t("generic") };
  }
}

export type StartOtpResult = { ok: true; devCode?: string } | { ok: false; error: string };

const phoneSchema = z.string().trim().min(6).max(20);

export async function startOtp(phone: string, locale: string): Promise<StartOtpResult> {
  const t = await errorTranslator(locale);
  try {
    const normalized = phoneSchema.parse(phone);
    const result = await requestOtp(normalized);
    return { ok: true, devCode: result.devCode };
  } catch (err) {
    const message = messageOf(err);
    if (message.includes("Invalid phone")) return { ok: false, error: t("invalidPhone") };
    if (message.includes("Too many OTP")) return { ok: false, error: t("rateLimited") };
    return { ok: false, error: t("generic") };
  }
}

export interface BookingSummaryDTO {
  bookingId: string;
  startAt: string;
  endAt: string;
  priceMinorSnapshot: number;
}

export type VerifyAndBookResult = { ok: true; booking: BookingSummaryDTO } | { ok: false; error: string };

const verifyAndBookSchema = z.object({
  serviceId: z.string().min(1),
  startAt: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(6).max(20),
  code: z.string().trim().regex(/^\d{6}$/, "Invalid code"),
  locale: z.enum(["en", "ar"]),
  sourceChannel: z.string().trim().min(1).max(100).optional(),
});
export type VerifyAndBookInput = z.input<typeof verifyAndBookSchema>;

const TIER_GATE_PATTERN = /available to (.+) members/i;

function mapBookingError(err: unknown, t: Awaited<ReturnType<typeof getTranslations>>): string {
  const message = messageOf(err);
  if (message.includes("no longer available") || message.includes("just taken")) return t("slotTaken");
  const tierMatch = TIER_GATE_PATTERN.exec(message);
  if (tierMatch) return t("tierGated", { tier: tierMatch[1] });
  if (message.includes("not currently available for booking") || message.includes("not available for online booking")) {
    return t("serviceUnavailable");
  }
  return t("generic");
}

// Verifies the OTP code, establishes a client session (so the client is
// signed in for /account going forward), and creates the booking. Runs as
// one action so the client component only needs a single "Confirm booking"
// step once the code is entered.
export async function verifyAndBook(input: VerifyAndBookInput): Promise<VerifyAndBookResult> {
  const data = verifyAndBookSchema.parse(input);
  const t = await errorTranslator(data.locale);

  const verified = await verifyOtp(data.phone, data.code);
  if (!verified) {
    return { ok: false, error: t("invalidCode") };
  }

  const token = await createClientSession(verified.userId);
  (await cookies()).set(CLIENT_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  try {
    const booking = await createBooking({
      serviceId: data.serviceId,
      startAt: data.startAt,
      client: { name: data.name, phone: data.phone },
      channel: "ONLINE",
      sourceChannel: data.sourceChannel,
      locale: data.locale,
    });
    const appointment = booking.appointments[0];
    if (!appointment) {
      return { ok: false, error: t("generic") };
    }
    return {
      ok: true,
      booking: {
        bookingId: booking.id,
        startAt: appointment.startAt.toISOString(),
        endAt: appointment.endAt.toISOString(),
        priceMinorSnapshot: appointment.priceMinorSnapshot,
      },
    };
  } catch (err) {
    return { ok: false, error: mapBookingError(err, t) };
  }
}
