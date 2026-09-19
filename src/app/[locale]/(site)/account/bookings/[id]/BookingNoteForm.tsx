"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { updateMyBookingNote } from "../../actions";

interface BookingNoteFormProps {
  locale: "en" | "ar";
  bookingId: string;
  initialNote: string;
}

// Lets the signed-in customer add/edit their own note on a booking
// (Booking.customerNote). The server action re-verifies ownership; on success
// we refresh so a later reload shows the persisted value.
export function BookingNoteForm({ locale, bookingId, initialNote }: BookingNoteFormProps) {
  const t = useTranslations("account.detail");
  const router = useRouter();
  const [note, setNote] = useState(initialNote);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateMyBookingNote(bookingId, note, locale);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-[var(--color-ink)]/60">{t("customerNoteHint")}</p>
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
        rows={4}
        maxLength={1000}
        placeholder={t("customerNotePlaceholder")}
        aria-label={t("customerNoteHeading")}
        className="w-full rounded-2xl border border-[var(--color-ink)]/15 bg-[var(--color-page)] px-4 py-3 text-sm leading-relaxed text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-[var(--color-ink)] px-6 py-2.5 text-sm font-medium tracking-wide text-[var(--color-page)] transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)]"
        >
          {isPending ? t("saving") : t("save")}
        </button>
        {saved && <span className="text-sm font-medium text-[var(--color-teal-ink,#2f6d67)]">{t("saved")} ✓</span>}
        {error && (
          <span role="alert" className="text-sm text-red-700">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
