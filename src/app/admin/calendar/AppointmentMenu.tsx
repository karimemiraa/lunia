"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BookingStatus } from "@prisma/client";
import { Modal } from "../_components/Modal";
import { checkInAction, startAction, completeAction, cancelAction, noShowAction, rescheduleAction, getCalendarSlotsAction, type CalendarSlotDTO } from "./actions";
import { SlotPicker } from "./SlotPicker";

export interface AppointmentMenuProps {
  bookingId: string;
  appointmentId: string;
  serviceId: string;
  status: BookingStatus;
  started: boolean;
  defaultDate: string;
  clientProfileId: string;
  clientName: string;
  /** Existing invoice for this booking (cross-link), if any. */
  invoice?: { id: string; number: string; status: string } | null;
  treatmentRecordId?: string | null;
  canManage: boolean;
  canBill: boolean;
  canClinical: boolean;
  /** "inline" renders every action as buttons (day modal); "menu" is a compact popover (grid cards). */
  layout?: "inline" | "menu";
}

type Result = { ok: true } | { ok: false; error: string };
const TERMINAL: BookingStatus[] = ["COMPLETED", "CANCELLED", "NO_SHOW"];

const btnPrimary = "lunia-btn lunia-btn-forest lunia-btn-sm min-h-9 disabled:cursor-not-allowed disabled:opacity-50";
const btnOutline = "lunia-btn lunia-btn-forest-outline lunia-btn-sm min-h-9 disabled:cursor-not-allowed disabled:opacity-50";
const btnDanger = "lunia-btn lunia-btn-danger lunia-btn-sm min-h-9 disabled:cursor-not-allowed disabled:opacity-50";
const item = "flex min-h-10 w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 text-start text-sm text-[var(--color-ink)] transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] disabled:opacity-50";

// Every next step for one appointment in one place: lifecycle (check in,
// start, complete, no-show, cancel), money (checkout / open invoice),
// clinical (treatment record), reschedule (modal), and the customer. All
// mutations go through the calendar server actions and refresh the route.
export function AppointmentMenu(props: AppointmentMenuProps) {
  const { bookingId, appointmentId, serviceId, status, started, defaultDate, clientProfileId, invoice, treatmentRecordId, canManage, canBill, canClinical, layout = "menu" } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingIntent, setPendingIntent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; href?: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(defaultDate);
  const [rescheduleSlot, setRescheduleSlot] = useState<CalendarSlotDTO | null>(null);
  const dateInputId = useId();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  // Popover closes on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isTerminal = TERMINAL.includes(status);
  const canCheckIn = canManage && (status === "REQUESTED" || status === "CONFIRMED");
  const canStart = canManage && status === "CHECKED_IN" && !started;
  const canComplete = canManage && (status === "CHECKED_IN" || status === "CONFIRMED");
  const canNoShow = canManage && (status === "CONFIRMED" || status === "CHECKED_IN");
  const canCancel = canManage && !isTerminal;
  const canReschedule = canManage && !isTerminal;
  const showCheckout = canBill && status !== "CANCELLED" && status !== "NO_SHOW";

  function run(intent: string, action: () => Promise<Result>) {
    setError(null);
    setNotice(null);
    setPendingIntent(intent);
    setOpen(false);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setRescheduleOpen(false);
        setRescheduleSlot(null);
        router.refresh();
      } else setError(result.error);
      setPendingIntent(null);
    });
  }

  function doCancel() {
    if (!confirm(`Cancel this appointment for ${props.clientName}?`)) return;
    run("cancel", async () => {
      const result = await cancelAction(bookingId);
      if (result.ok && result.waitlistNotified > 0) {
        setNotice({
          text: `${result.waitlistNotified} ${result.waitlistNotified === 1 ? "person was" : "people were"} waiting for this day and ${result.waitlistNotified === 1 ? "has" : "have"} been notified.`,
          href: "/admin/waitlist?status=NOTIFIED",
        });
      }
      return result.ok ? { ok: true } : result;
    });
  }

  const label = (intent: string, idle: string, busy: string) => (pendingIntent === intent ? busy : idle);

  // The primary next step is always a direct button (also what the e2e flow clicks).
  const primary = canCheckIn ? (
    <button type="button" disabled={isPending} onClick={() => run("check-in", () => checkInAction(bookingId))} className={btnPrimary}>
      {label("check-in", "Check in", "Checking in…")}
    </button>
  ) : canStart ? (
    <button type="button" disabled={isPending} onClick={() => run("start", () => startAction(bookingId))} className={btnPrimary}>
      {label("start", "Start", "Starting…")}
    </button>
  ) : canComplete ? (
    <button type="button" disabled={isPending} onClick={() => run("complete", () => completeAction(bookingId))} className={btnPrimary}>
      {label("complete", "Complete", "Completing…")}
    </button>
  ) : status === "COMPLETED" && showCheckout && !invoice ? (
    <Link href={`/admin/billing/new?booking=${bookingId}`} className={btnPrimary}>
      Checkout
    </Link>
  ) : null;

  const secondary = (
    <>
      {canComplete && (canCheckIn || canStart) && (
        <button type="button" disabled={isPending} onClick={() => run("complete", () => completeAction(bookingId))} className={layout === "inline" ? btnOutline : item}>
          {label("complete", "Complete", "Completing…")}
        </button>
      )}
      {showCheckout &&
        (invoice ? (
          <Link href={`/admin/billing/${invoice.id}`} className={layout === "inline" ? btnOutline : item}>
            {invoice.status === "DRAFT" ? "Open draft invoice" : `Invoice ${invoice.number}`}
          </Link>
        ) : (
          !(status === "COMPLETED" && primary) && (
            <Link href={`/admin/billing/new?booking=${bookingId}`} className={layout === "inline" ? btnOutline : item}>
              Checkout
            </Link>
          )
        ))}
      {canClinical && (
        <Link href={treatmentRecordId ? `/admin/clients/${clientProfileId}/clinical/treatment/${treatmentRecordId}` : `/admin/clients/${clientProfileId}/clinical/treatment?appointmentId=${appointmentId}`} className={layout === "inline" ? btnOutline : item}>
          {treatmentRecordId ? "Treatment record" : "Add treatment record"}
        </Link>
      )}
      {canReschedule && (
        <button type="button" disabled={isPending} onClick={() => { setOpen(false); setRescheduleOpen(true); }} className={layout === "inline" ? btnOutline : item}>
          Reschedule
        </button>
      )}
      {canNoShow && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            if (confirm("Mark this appointment as a no-show?")) run("no-show", () => noShowAction(bookingId));
          }}
          className={layout === "inline" ? btnOutline : item}
        >
          {label("no-show", "No-show", "Marking…")}
        </button>
      )}
      <Link href={`/admin/clients/${clientProfileId}`} className={layout === "inline" ? btnOutline : item}>
        Open customer
      </Link>
      {canCancel && (
        <button type="button" disabled={isPending} onClick={doCancel} className={layout === "inline" ? btnDanger : `${item} text-red-700 hover:bg-red-50`}>
          {label("cancel", "Cancel appointment", "Cancelling…")}
        </button>
      )}
    </>
  );

  return (
    <div ref={rootRef} className="relative flex flex-col gap-2" data-testid="appointment-menu">
      {layout === "inline" ? (
        <div className="flex flex-wrap gap-2">
          {primary}
          {secondary}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          {primary}
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={`Actions for ${props.clientName}`}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink)]/70 transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
          {open && (
            <div id={menuId} role="menu" className="absolute end-0 top-full z-30 mt-1 flex w-56 flex-col gap-0.5 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-md)]">
              {secondary}
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" aria-live="polite" className="rounded-[var(--radius-sm)] bg-[var(--color-gold)]/15 px-3 py-2 text-xs text-[var(--color-ink)]" data-testid="waitlist-notice">
          {notice.text}{" "}
          {notice.href && (
            <Link href={notice.href} className="font-medium text-[var(--color-teal-ink)] underline">
              Open waitlist
            </Link>
          )}
        </p>
      )}

      {rescheduleOpen && (
        <Modal title={`Reschedule ${props.clientName}`} onClose={() => { setRescheduleOpen(false); setRescheduleSlot(null); }}>
          <div className="flex flex-col gap-4">
            <SlotPicker
              serviceId={serviceId}
              date={rescheduleDate}
              onDateChange={setRescheduleDate}
              selected={rescheduleSlot}
              onSelect={setRescheduleSlot}
              fetchSlots={(svc, dateISO) => getCalendarSlotsAction(svc, dateISO, appointmentId)}
              dateInputId={dateInputId}
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setRescheduleOpen(false); setRescheduleSlot(null); }} className="lunia-btn lunia-btn-ghost min-h-11">
                Close
              </button>
              <button
                type="button"
                disabled={isPending || !rescheduleSlot}
                onClick={() => rescheduleSlot && run("reschedule", () => rescheduleAction(bookingId, rescheduleSlot.startAt, rescheduleSlot.staffUserId, rescheduleSlot.roomId))}
                className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-60"
              >
                {label("reschedule", "Confirm reschedule", "Rescheduling…")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
