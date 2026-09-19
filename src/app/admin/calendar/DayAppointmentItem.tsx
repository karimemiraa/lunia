"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BookingStatus } from "@prisma/client";
import { AppointmentActions } from "./AppointmentActions";
import { saveCenterNoteAction } from "./actions";

interface DayAppointmentItemProps {
  bookingId: string;
  appointmentId: string;
  serviceId: string;
  status: BookingStatus;
  timeLabel: string;
  fullTimeLabel: string;
  clientName: string;
  clientPhone: string | null;
  serviceName: string;
  staffName: string;
  roomName: string;
  centerNote: string | null;
  customerNote: string | null;
  defaultDate: string;
  canManage: boolean;
}

// Staff-authored note shown to the customer (Booking.centerNote) + read-only
// display of the customer's own note (Booking.customerNote). Rendered inside
// the expanded appointment panel.
function NotesSection({
  bookingId,
  centerNote,
  customerNote,
  canManage,
}: {
  bookingId: string;
  centerNote: string | null;
  customerNote: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState(centerNote ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveCenterNoteAction(bookingId, note);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--color-cream)]/40 p-3">
      {customerNote && (
        <div className="flex flex-col gap-1">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/45">
            Customer&rsquo;s note
          </span>
          <p className="whitespace-pre-wrap text-sm text-[var(--color-ink)]/85">{customerNote}</p>
        </div>
      )}
      {canManage ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/45">
            Note for customer (shown on their appointment page)
          </span>
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setSaved(false);
            }}
            rows={2}
            placeholder="e.g. Please arrive 10 minutes early and avoid retinol for 3 days before your visit."
            className="lunia-input text-sm"
          />
          <div className="flex items-center gap-2">
            <button type="button" onClick={save} disabled={isPending} className="lunia-btn lunia-btn-forest lunia-btn-sm disabled:opacity-60">
              {isPending ? "Saving…" : "Save note"}
            </button>
            {saved && <span className="text-xs font-medium text-[var(--color-teal-ink,#2f6d67)]">Saved ✓</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      ) : (
        centerNote && (
          <div className="flex flex-col gap-1">
            <span className="text-[0.65rem] font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/45">Note for customer</span>
            <p className="whitespace-pre-wrap text-sm text-[var(--color-ink)]/85">{centerNote}</p>
          </div>
        )
      )}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70",
  CONFIRMED: "bg-[var(--color-teal)]/20 text-[var(--color-teal-ink)]",
  CHECKED_IN: "bg-[var(--color-gold)]/25 text-[#7c6a2f]",
  COMPLETED: "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]",
  CANCELLED: "bg-red-100 text-red-700",
  NO_SHOW: "bg-red-100 text-red-700",
};

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[0.65rem] font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/45">{label}</dt>
      <dd className="text-sm text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}

// One appointment in the day popup: a compact single-line summary that expands
// on click to reveal full details + actions. Client-side open state persists
// across the router.refresh() that AppointmentActions triggers (same key), so
// the row stays open while you act on it.
export function DayAppointmentItem(props: DayAppointmentItemProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      data-testid="appointment-row"
      data-booking-id={props.bookingId}
      data-booking-status={props.status}
      className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)]"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start transition-colors hover:bg-[var(--color-forest)]/[0.04]"
      >
        <span className="flex min-w-0 items-baseline gap-3">
          <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--color-ink)]">{props.timeLabel}</span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm text-[var(--color-ink)]">{props.clientName}</span>
            {props.clientPhone && <span className="truncate text-xs text-[var(--color-ink)]/50">{props.clientPhone}</span>}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${STATUS_STYLES[props.status] ?? "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70"}`}>
            {props.status.replace("_", " ")}
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 text-[var(--color-ink)]/40 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-[var(--line)] px-4 py-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <Detail label="Time" value={props.fullTimeLabel} />
            <Detail label="Service" value={props.serviceName} />
            <Detail label="Staff" value={props.staffName} />
            <Detail label="Room" value={props.roomName} />
          </dl>
          <NotesSection
            bookingId={props.bookingId}
            centerNote={props.centerNote}
            customerNote={props.customerNote}
            canManage={props.canManage}
          />
          {props.canManage && (
            <AppointmentActions
              bookingId={props.bookingId}
              appointmentId={props.appointmentId}
              serviceId={props.serviceId}
              status={props.status}
              defaultDate={props.defaultDate}
            />
          )}
        </div>
      )}
    </div>
  );
}
