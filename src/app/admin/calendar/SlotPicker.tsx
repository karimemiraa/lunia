"use client";

import { useEffect, useState, useTransition } from "react";
import type { CalendarSlotDTO } from "./actions";

/** Asia/Riyadh is fixed at UTC+3 year-round (no DST) — see availability.ts. */
const CENTER_TZ = "Asia/Riyadh";

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

const inputClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

type FetchSlots = (
  serviceId: string,
  dateISO: string,
) => Promise<{ ok: true; slots: CalendarSlotDTO[] } | { ok: false; error: string }>;

interface SlotResultsProps {
  serviceId: string;
  date: string;
  fetchSlots: FetchSlots;
  selected: CalendarSlotDTO | null;
  onSelect: (slot: CalendarSlotDTO | null) => void;
}

// Fetches and renders the slot buttons for one (serviceId, date) pair. Given
// a fresh `key` by the parent whenever serviceId/date changes, this mounts
// (and its local slots/error state starts empty) instead of updating in
// place -- so the fetch-on-mount effect below never needs to reset state
// itself, keeping it clear of the "no setState synchronously in an effect"
// lint rule.
function SlotResults({ serviceId, date, fetchSlots, selected, onSelect }: SlotResultsProps) {
  const [slots, setSlots] = useState<CalendarSlotDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await fetchSlots(serviceId, date);
      if (result.ok) {
        setSlots(result.slots);
      } else {
        setError(result.error);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchSlots is stable per-caller; this effect is meant to run exactly once per mount (i.e. once per serviceId+date key from the parent).
  }, []);

  if (isPending) return <p className="text-sm text-[var(--color-ink)]/60">Loading available times…</p>;
  if (error) return (
    <p role="alert" className="text-sm font-medium text-red-700">
      {error}
    </p>
  );
  if (slots && slots.length === 0) return <p className="text-sm text-[var(--color-ink)]/60">No available times on this day.</p>;
  if (!slots) return null;

  return (
    <div className="flex flex-wrap gap-2" data-testid="slot-options">
      {slots.map((slot) => {
        const isSelected = selected?.startAt === slot.startAt;
        return (
          <button
            key={slot.startAt}
            type="button"
            data-slot-time={slot.startAt}
            aria-pressed={isSelected}
            onClick={() => onSelect(slot)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              isSelected
                ? "border-[var(--color-teal)] bg-[var(--color-teal)] text-[var(--color-ink)]"
                : "border-[var(--color-ink)]/20 text-[var(--color-ink)] hover:border-[var(--color-ink)]/40"
            }`}
          >
            {formatTime(slot.startAt)}
          </button>
        );
      })}
    </div>
  );
}

interface SlotPickerProps {
  serviceId: string | null;
  date: string;
  onDateChange: (date: string) => void;
  selected: CalendarSlotDTO | null;
  onSelect: (slot: CalendarSlotDTO | null) => void;
  fetchSlots: FetchSlots;
  dateInputId?: string;
}

// Date + available-time picker shared by the walk-in form and the reschedule
// panel: pick a date, fetch that day's bookable slots for the chosen
// service via `fetchSlots` (a server action), then pick one. Slots already
// carry the resolved (staffUserId, roomId) pair the underlying booking
// engine assigned, so the caller doesn't need its own staff/room selects.
export function SlotPicker({ serviceId, date, onDateChange, selected, onSelect, fetchSlots, dateInputId }: SlotPickerProps) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">Date</span>
        <input
          id={dateInputId}
          type="date"
          value={date}
          onChange={(event) => {
            onSelect(null);
            onDateChange(event.target.value);
          }}
          className={inputClass}
        />
      </label>

      {!serviceId && <p className="text-sm text-[var(--color-ink)]/60">Choose a service first.</p>}
      {serviceId && date && (
        <SlotResults key={`${serviceId}::${date}`} serviceId={serviceId} date={date} fetchSlots={fetchSlots} selected={selected} onSelect={onSelect} />
      )}
    </div>
  );
}
