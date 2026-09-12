"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cancelMyBooking } from "./actions";
import type { BookingStatus } from "@prisma/client";

export type AccountBookingStatus = BookingStatus;

export interface AccountBookingDTO {
  id: string;
  serviceName: string;
  /** ISO instant of the appointment start, formatted client-side in center-local time. */
  startAtIso: string;
  status: AccountBookingStatus;
  /** True when this booking is still cancellable (upcoming, active, and >24h out). */
  canCancel: boolean;
  /**
   * One-tap rebooking (D2): set for a past COMPLETED booking whose service
   * is still known -- deep-links the wizard at /book?service=<slug>&staff=<id>,
   * which prefills that service (and tries the same staff) and lands on the
   * next available slot. Null when this booking isn't rebookable this way.
   */
  rebook: { serviceSlug: string; staffUserId: string } | null;
}

interface AccountBookingsProps {
  locale: "en" | "ar";
  upcoming: AccountBookingDTO[];
  past: AccountBookingDTO[];
}

/** Asia/Riyadh is fixed at UTC+3 year-round (no DST) — see availability.ts. */
const CENTER_TZ = "Asia/Riyadh";

function formatDateTime(iso: string, locale: string): string {
  const intlLocale = locale === "ar" ? "ar-SA" : "en-US";
  return new Intl.DateTimeFormat(intlLocale, {
    timeZone: CENTER_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

const secondaryButtonClass =
  "inline-flex items-center justify-center whitespace-nowrap rounded-full border border-[var(--color-ink)]/20 px-5 py-2 text-sm font-medium tracking-wide text-[var(--color-ink)] transition-colors hover:bg-[var(--color-ink)]/5 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)]";

function BookingCard({
  booking,
  locale,
  onCancel,
  isCancelling,
}: {
  booking: AccountBookingDTO;
  locale: "en" | "ar";
  onCancel?: (id: string) => void;
  isCancelling: boolean;
}) {
  const t = useTranslations("account");

  return (
    <li
      data-testid="account-booking-card"
      data-booking-id={booking.id}
      data-booking-status={booking.status}
      className="flex flex-col gap-2 rounded-2xl border border-[var(--color-ink)]/10 bg-[var(--color-page)] p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-base font-medium text-[var(--color-ink)]">{booking.serviceName}</span>
        <span className="rounded-full bg-[var(--color-ink)]/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/70">
          {t(`status.${booking.status}`)}
        </span>
      </div>
      <p className="text-sm text-[var(--color-ink)]/65">{formatDateTime(booking.startAtIso, locale)}</p>
      {booking.canCancel && onCancel && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => onCancel(booking.id)}
            disabled={isCancelling}
            className={secondaryButtonClass}
          >
            {isCancelling ? t("cancellingLabel") : t("cancelLabel")}
          </button>
        </div>
      )}
      {booking.rebook && (
        <div className="mt-2">
          <Link
            href={`/${locale}/book?service=${encodeURIComponent(booking.rebook.serviceSlug)}&staff=${encodeURIComponent(booking.rebook.staffUserId)}`}
            className={secondaryButtonClass}
            data-testid="account-book-again"
          >
            {t("bookAgainLabel")}
          </Link>
        </div>
      )}
    </li>
  );
}

// Renders the signed-in client's upcoming and past bookings, with a
// client-side Cancel action for upcoming bookings still >24h out. Cancelling
// calls the cancelMyBooking server action (which re-verifies ownership and
// the 24h window server-side) and then refreshes the server component tree
// so the booking reappears in its new (cancelled/past) bucket.
export function AccountBookings({ locale, upcoming, past }: AccountBookingsProps) {
  const t = useTranslations("account");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleCancel(bookingId: string) {
    setError(null);
    setCancellingId(bookingId);
    startTransition(async () => {
      const result = await cancelMyBooking(bookingId, locale);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
      setCancellingId(null);
    });
  }

  return (
    <div className="flex flex-col gap-12">
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-4" data-testid="account-upcoming">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">
            {t("upcomingHeading")}
          </h2>
          <Link
            href={`/${locale}/book`}
            className="text-sm font-medium text-[var(--color-ink)] underline decoration-[var(--color-gold)] decoration-2 underline-offset-4"
          >
            {t("rebookLabel")}
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-[var(--color-ink)]/60">{t("emptyUpcoming")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                locale={locale}
                onCancel={handleCancel}
                isCancelling={isPending && cancellingId === booking.id}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-4" data-testid="account-past">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">
          {t("pastHeading")}
        </h2>
        {past.length === 0 ? (
          <p className="text-sm text-[var(--color-ink)]/60">{t("emptyPast")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {past.map((booking) => (
              <BookingCard key={booking.id} booking={booking} locale={locale} isCancelling={false} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
