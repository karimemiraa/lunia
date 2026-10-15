// Display labels for the enum values the scheduling screens show (calendar,
// appointment hub, waitlist). English keeps today's raw-enum rendering
// ("CHECKED IN", "front desk"); Arabic goes through the staff dictionary.
// Plain data + pure functions: safe for server and client components.
import { intlLocale, type StaffLocale, type T } from "../_i18n/t";

const BOOKING_STATUS: Record<string, string> = {
  REQUESTED: "Requested",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked in",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No show",
};

const WAITLIST_STATUS: Record<string, string> = {
  WAITING: "Waiting",
  NOTIFIED: "Notified",
  CONVERTED: "Converted",
  EXPIRED: "Expired",
};

const INVOICE_STATUS: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  PARTIALLY_PAID: "Part paid",
  PAID: "Paid",
  VOID: "Void",
};

const CHANNEL: Record<string, string> = {
  ONLINE: "Online",
  FRONT_DESK: "Front desk",
  WALK_IN: "Walk-in",
};

const LINE_KIND: Record<string, string> = {
  SERVICE: "Service",
  PRODUCT: "Product",
  PACKAGE: "Package",
  GIFT_CARD: "Gift card",
  OTHER: "Other",
};

const PHOTO_KIND: Record<string, string> = {
  BEFORE: "Before",
  AFTER: "After",
  ANALYSIS: "Analysis",
  OTHER: "Other",
};

function pick(map: Record<string, string>, value: string, locale: StaffLocale, t: T, english: string): string {
  return locale === "ar" ? t(map[value] ?? english) : english;
}

/** "CHECKED IN" in English (uppercase pills), «تم تسجيل الحضور» in Arabic. */
export function bookingStatusText(status: string, locale: StaffLocale, t: T): string {
  return pick(BOOKING_STATUS, status, locale, t, status.replace("_", " "));
}

export function waitlistStatusText(status: string, locale: StaffLocale, t: T): string {
  return pick(WAITLIST_STATUS, status, locale, t, status);
}

export function invoiceStatusText(status: string, locale: StaffLocale, t: T): string {
  return pick(INVOICE_STATUS, status, locale, t, status.replace("_", " "));
}

/** "front desk" in English, «الاستقبال» in Arabic. */
export function channelText(channel: string, locale: StaffLocale, t: T): string {
  return pick(CHANNEL, channel, locale, t, channel.replace("_", " ").toLowerCase());
}

export function lineKindText(kind: string, locale: StaffLocale, t: T): string {
  return pick(LINE_KIND, kind, locale, t, kind.toLowerCase());
}

export function photoKindText(kind: string, locale: StaffLocale, t: T): string {
  return pick(PHOTO_KIND, kind, locale, t, kind.toLowerCase());
}

/** Weekday names (0 = Sunday) in the staff locale; English stays "Sun"/"Sunday". */
export function weekdayNames(locale: StaffLocale, width: "short" | "long"): string[] {
  const english = width === "short" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  if (locale !== "ar") return english;
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "long", timeZone: "UTC" });
  // 2026-01-04 is a Sunday. Arabic short and long weekday names are the same word.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2026, 0, 4 + i))));
}

/** Arabic name with English fallback (DB records with an optional Arabic field). */
export function nameIn(locale: StaffLocale, en: string, ar: string | null | undefined): string {
  return locale === "ar" && ar && ar.trim() ? ar : en;
}
