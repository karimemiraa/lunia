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
import {
  requestOtp,
  verifyOtp,
  resolveIdentifier,
  createClientSession,
  CLIENT_SESSION_COOKIE,
} from "@/modules/iam/clientAuth";

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

// The identify step accepts either a phone number or an email address in one
// field -- resolveIdentifier (clientAuth.ts) classifies which one it is and
// requestOtp/verifyOtp route delivery accordingly. This schema only bounds
// length; the real format check (and the specific "Invalid phone"/"Invalid
// email" error) happens inside resolveIdentifier so both paths share one
// source of truth for what counts as valid.
const identifierSchema = z.string().trim().min(3).max(254);

export async function startOtp(identifier: string, locale: string): Promise<StartOtpResult> {
  const t = await errorTranslator(locale);
  try {
    const normalized = identifierSchema.parse(identifier);
    const result = await requestOtp(normalized, { locale });
    return { ok: true, devCode: result.devCode };
  } catch (err) {
    const message = messageOf(err);
    if (message.includes("Invalid phone") || message.includes("Invalid email")) {
      return { ok: false, error: t("invalidIdentifier") };
    }
    if (message.includes("Too many code requests")) return { ok: false, error: t("rateLimited") };
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
  identifier: z.string().trim().min(3).max(254),
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
  if (message.includes("Invalid phone") || message.includes("Invalid email")) {
    return t("invalidIdentifier");
  }
  return t("generic");
}

// Best-effort locale extraction from raw (possibly malformed) input, used
// only to pick the right error-message translator when schema.parse itself
// fails below -- at that point `data.locale` doesn't exist yet.
function extractRawLocale(input: unknown): string {
  if (input && typeof input === "object" && "locale" in input) {
    const locale = (input as { locale?: unknown }).locale;
    if (typeof locale === "string") return locale;
  }
  return "en";
}

// Verifies the OTP code, establishes a client session (so the client is
// signed in for /account going forward), and creates the booking. Runs as
// one action so the client component only needs a single "Confirm booking"
// step once the code is entered.
//
// The whole body -- including schema.parse -- runs inside the try/catch so a
// malformed or tampered direct call (bad shape, wrong types) returns a
// friendly `{ok:false,error}` instead of throwing an uncaught ZodError,
// mirroring getSlots/startOtp above.
export async function verifyAndBook(input: VerifyAndBookInput): Promise<VerifyAndBookResult> {
  const t = await errorTranslator(extractRawLocale(input));

  try {
    const data = verifyAndBookSchema.parse(input);

    const verified = await verifyOtp(data.identifier, data.code, { sourceChannel: data.sourceChannel });
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

    // The code above already verified via verifyOtp, so the identifier is
    // known-valid here -- resolveIdentifier just classifies it again to
    // decide whether it goes into client.phone or client.email.
    const id = resolveIdentifier(data.identifier);
    const booking = await createBooking({
      serviceId: data.serviceId,
      startAt: data.startAt,
      client: {
        name: data.name,
        phone: id.kind === "phone" ? id.value : undefined,
        email: id.kind === "email" ? id.value : undefined,
      },
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
