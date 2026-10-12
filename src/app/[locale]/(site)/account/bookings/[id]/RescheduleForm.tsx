"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getMyRescheduleSlots, rescheduleMyBooking } from "../../actions";

interface RescheduleFormProps {
  locale: "en" | "ar";
  bookingId: string;
  /** First and last selectable dates (center-local YYYY-MM-DD). */
  minDate: string;
  maxDate: string;
}

// Lets the customer move their own appointment: pick a date, see the times
// actually free for this service, confirm. Every check (ownership, 24h
// policy, live availability) is repeated on the server.
export function RescheduleForm({ locale, bookingId, minDate, maxDate }: RescheduleFormProps) {
  const t = useTranslations("account.reschedule");
  const router = useRouter();
  const [date, setDate] = useState("");
  const [times, setTimes] = useState<{ startAtIso: string; label: string }[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, startLoading] = useTransition();
  const [moving, startMoving] = useTransition();

  function loadTimes(nextDate: string) {
    setDate(nextDate);
    setPicked(null);
    setError(null);
    setTimes(null);
    if (!nextDate) return;
    startLoading(async () => {
      const res = await getMyRescheduleSlots(bookingId, nextDate, locale);
      if (res.ok) setTimes(res.times);
      else setError(res.error);
    });
  }

  function confirm() {
    if (!picked) return;
    setError(null);
    startMoving(async () => {
      const res = await rescheduleMyBooking(bookingId, picked, locale);
      if (res.ok) {
        setDone(true);
        setTimes(null);
        setPicked(null);
        router.refresh();
      } else {
        setError(res.error);
        loadTimes(date); // refresh the list: the chosen time may have just gone
      }
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="reschedule-form">
      <p className="text-sm text-[var(--color-ink)]/75">{t("hint")}</p>
      <label className="flex w-fit flex-col gap-1.5 text-sm">
        <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/75">{t("date")}</span>
        <input
          type="date"
          value={date}
          min={minDate}
          max={maxDate}
          onChange={(e) => loadTimes(e.target.value)}
          className="rounded-full border border-[var(--color-ink)]/15 bg-[var(--color-page)] px-4 py-2.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none"
          data-testid="reschedule-date"
        />
      </label>

      {loading && <p className="text-sm text-[var(--color-ink)]/65">{t("loading")}</p>}
      {times && times.length === 0 && <p className="text-sm text-[var(--color-ink)]/75">{t("noTimes")}</p>}
      {times && times.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/75">{t("chooseTime")}</legend>
          <div className="flex flex-wrap gap-2">
            {times.map((slot) => (
              <button
                key={slot.startAtIso}
                type="button"
                onClick={() => setPicked(slot.startAtIso)}
                aria-pressed={picked === slot.startAtIso}
                className={`min-h-11 rounded-full border px-4 text-sm tabular-nums transition-colors ${
                  picked === slot.startAtIso
                    ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-on-ink)]"
                    : "border-[var(--color-ink)]/15 text-[var(--color-ink)] hover:border-[var(--color-ink)]/40"
                }`}
                data-testid="reschedule-slot"
              >
                {slot.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {picked && (
        <button
          type="button"
          onClick={confirm}
          disabled={moving}
          className="inline-flex w-fit items-center justify-center rounded-full bg-[var(--color-ink)] px-6 py-2.5 text-sm font-medium text-[var(--color-on-ink)] transition-opacity hover:opacity-90 disabled:opacity-60"
          data-testid="reschedule-confirm"
        >
          {moving ? t("moving") : t("confirm")}
        </button>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm font-medium text-[var(--color-teal-ink,var(--color-ink))]" data-testid="reschedule-done">
          {t("done")}
        </p>
      )}
    </div>
  );
}
