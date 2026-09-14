"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BookingStatus } from "@prisma/client";
import { checkInAction, completeAction, cancelAction, noShowAction, rescheduleAction, getCalendarSlotsAction, type CalendarSlotDTO } from "./actions";
import { SlotPicker } from "./SlotPicker";

interface AppointmentActionsProps {
  bookingId: string;
  appointmentId: string;
  serviceId: string;
  status: BookingStatus;
  defaultDate: string;
}

const buttonClass =
  "rounded border border-[var(--color-ink)]/20 px-2.5 py-1 text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-cream)] disabled:cursor-not-allowed disabled:opacity-50";
const dangerButtonClass =
  "rounded border border-red-600/30 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClass =
  "lunia-btn lunia-btn-primary lunia-btn-sm disabled:cursor-not-allowed disabled:opacity-50";

const TERMINAL_STATUSES: BookingStatus[] = ["COMPLETED", "CANCELLED", "NO_SHOW"];

// Per-row action buttons for the calendar day view: check-in, complete,
// cancel, no-show, and an inline reschedule panel. Every action calls a
// server action directly (not via a <form>), then router.refresh() picks up
// the revalidated /admin/calendar data — same pattern as
// site/account/AccountBookings.tsx's cancel flow.
export function AppointmentActions({ bookingId, appointmentId, serviceId, status, defaultDate }: AppointmentActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingIntent, setPendingIntent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reschedulingOpen, setReschedulingOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(defaultDate);
  const [rescheduleSlot, setRescheduleSlot] = useState<CalendarSlotDTO | null>(null);
  const dateInputId = useId();

  const isTerminal = TERMINAL_STATUSES.includes(status);
  const canCheckIn = status === "REQUESTED" || status === "CONFIRMED";
  const canComplete = status === "CHECKED_IN" || status === "CONFIRMED";
  const canMarkNoShow = status === "CONFIRMED" || status === "CHECKED_IN";

  function run(intent: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    setPendingIntent(intent);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setReschedulingOpen(false);
        setRescheduleSlot(null);
        router.refresh();
      } else {
        setError(result.error);
      }
      setPendingIntent(null);
    });
  }

  function fetchSlotsExcludingSelf(svcId: string, dateISO: string) {
    return getCalendarSlotsAction(svcId, dateISO, appointmentId);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {canCheckIn && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run("check-in", () => checkInAction(bookingId))}
            className={primaryButtonClass}
          >
            {pendingIntent === "check-in" ? "Checking in…" : "Check in"}
          </button>
        )}
        {canComplete && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run("complete", () => completeAction(bookingId))}
            className={buttonClass}
          >
            {pendingIntent === "complete" ? "Completing…" : "Complete"}
          </button>
        )}
        {!isTerminal && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => setReschedulingOpen((open) => !open)}
            className={buttonClass}
          >
            Reschedule
          </button>
        )}
        {canMarkNoShow && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (confirm("Mark this appointment as a no-show?")) {
                run("no-show", () => noShowAction(bookingId));
              }
            }}
            className={buttonClass}
          >
            {pendingIntent === "no-show" ? "Marking…" : "No-show"}
          </button>
        )}
        {!isTerminal && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (confirm("Cancel this appointment?")) {
                run("cancel", () => cancelAction(bookingId));
              }
            }}
            className={dangerButtonClass}
          >
            {pendingIntent === "cancel" ? "Cancelling…" : "Cancel"}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}

      {reschedulingOpen && (
        <div className="flex flex-col gap-3 rounded border border-[var(--color-ink)]/15 bg-[var(--color-cream)]/40 p-3">
          <SlotPicker
            serviceId={serviceId}
            date={rescheduleDate}
            onDateChange={setRescheduleDate}
            selected={rescheduleSlot}
            onSelect={setRescheduleSlot}
            fetchSlots={fetchSlotsExcludingSelf}
            dateInputId={dateInputId}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending || !rescheduleSlot}
              onClick={() =>
                rescheduleSlot &&
                run("reschedule", () =>
                  rescheduleAction(bookingId, rescheduleSlot.startAt, rescheduleSlot.staffUserId, rescheduleSlot.roomId),
                )
              }
              className={primaryButtonClass}
            >
              {pendingIntent === "reschedule" ? "Rescheduling…" : "Confirm reschedule"}
            </button>
            <button
              type="button"
              onClick={() => {
                setReschedulingOpen(false);
                setRescheduleSlot(null);
              }}
              className={buttonClass}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
