"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSeriesAction, frontDeskBookAction, getCalendarSlotsAction, previewSeriesAction, type CalendarSlotDTO, type SeriesPreviewDTO } from "./actions";
import { SlotPicker } from "./SlotPicker";

export interface FrontDeskServiceDTO {
  id: string;
  name: string;
  departmentName: string;
  durationMin: number;
}

interface WalkInFormProps {
  services: FrontDeskServiceDTO[];
  defaultDate: string;
  /** Prefill customer details (e.g. from a customer page "New booking" link). */
  defaultName?: string;
  defaultPhone?: string;
  /** Preferred slot from a clicked calendar gap: auto-selected once that day's slots load. */
  preferredStartAt?: string;
  preferredStaffUserId?: string;
}

const inputClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

const labelClass = "flex flex-col gap-1 text-sm";

// Front-desk / walk-in booking form: staff pick a (possibly in-center-only,
// non-online-bookable) service, a date, and one of that day's available
// times, then enter the client's name and phone. Submits via channel
// FRONT_DESK, which bypasses the online-only onlineBookable/inCenterOnly
// gate in createBooking while still going through its normal
// find-or-create-client and double-booking checks.
export function WalkInForm({ services, defaultDate, defaultName = "", defaultPhone = "", preferredStartAt, preferredStaffUserId }: WalkInFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [selectedSlot, setSelectedSlot] = useState<CalendarSlotDTO | null>(null);
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Recurring series ("every N weeks × count"), previewed before booking.
  const [repeat, setRepeat] = useState(false);
  const [intervalWeeks, setIntervalWeeks] = useState(2);
  const [count, setCount] = useState(6);
  const [preview, setPreview] = useState<SeriesPreviewDTO[] | null>(null);
  const [checking, startChecking] = useTransition();

  const dateInputId = useId();
  const nameId = useId();
  const phoneId = useId();

  const groupedServices = useMemo(() => {
    const byDept = new Map<string, FrontDeskServiceDTO[]>();
    for (const service of services) {
      const list = byDept.get(service.departmentName) ?? [];
      list.push(service);
      byDept.set(service.departmentName, list);
    }
    return [...byDept.entries()];
  }, [services]);

  const dFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", weekday: "short", day: "numeric", month: "short", year: "numeric" });

  function checkDates() {
    if (!serviceId || !selectedSlot) {
      setError("Choose a service and the first visit's time.");
      return;
    }
    setError(null);
    startChecking(async () => {
      const r = await previewSeriesAction({ serviceId, firstStartAt: selectedSlot.startAt, staffUserId: selectedSlot.staffUserId, intervalWeeks, count });
      if (r.ok) setPreview(r.occurrences);
      else setError(r.error);
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!serviceId || !selectedSlot) {
      setError("Choose a service and an available time.");
      return;
    }
    if (!name.trim() || !phone.trim()) {
      setError("Customer name and phone are required.");
      return;
    }

    if (repeat) {
      if (!preview) {
        checkDates();
        return;
      }
      startTransition(async () => {
        const r = await createSeriesAction({ serviceId, firstStartAt: selectedSlot.startAt, staffUserId: selectedSlot.staffUserId, intervalWeeks, count, name, phone });
        if (r.ok) {
          setSuccess(`${r.booked} visit${r.booked === 1 ? "" : "s"} booked.${r.skipped.length ? ` Not free (book separately): ${r.skipped.join(", ")}.` : ""}`);
          setName("");
          setPhone("");
          setSelectedSlot(null);
          setPreview(null);
          router.push(`/admin/calendar?day=${date}`);
        } else setError(r.error);
      });
      return;
    }

    startTransition(async () => {
      const result = await frontDeskBookAction({
        serviceId,
        startAt: selectedSlot.startAt,
        staffUserId: selectedSlot.staffUserId,
        roomId: selectedSlot.roomId,
        name,
        phone,
      });
      if (result.ok) {
        setSuccess("Booking created.");
        setName("");
        setPhone("");
        setSelectedSlot(null);
        // Keep the day modal open on the booked day so the new appointment
        // appears in the list immediately (server re-render via the day param).
        router.push(`/admin/calendar?day=${date}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} data-testid="walk-in-form" className="flex flex-col gap-4">
      {services.length === 0 ? (
        <p className="text-sm text-[var(--color-ink)]/60">No published services to book.</p>
      ) : (
        <>
          <label className={labelClass}>
            <span className="font-medium text-[var(--color-ink)]">Service</span>
            <select
              value={serviceId}
              onChange={(event) => {
                setServiceId(event.target.value);
                setSelectedSlot(null);
              }}
              className={inputClass}
            >
              {groupedServices.map(([departmentName, deptServices]) => (
                <optgroup key={departmentName} label={departmentName}>
                  {deptServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} ({service.durationMin} min)
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <SlotPicker
            serviceId={serviceId || null}
            date={date}
            onDateChange={setDate}
            selected={selectedSlot}
            onSelect={(slot) => {
              setSelectedSlot(slot);
              setPreview(null);
            }}
            fetchSlots={getCalendarSlotsAction}
            dateInputId={dateInputId}
            preferredStartAt={preferredStartAt}
            preferredStaffUserId={preferredStaffUserId}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass} htmlFor={nameId}>
              <span className="font-medium text-[var(--color-ink)]">Customer name</span>
              <input
                id={nameId}
                type="text"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass} htmlFor={phoneId}>
              <span className="font-medium text-[var(--color-ink)]">Customer phone</span>
              <input
                id={phoneId}
                type="tel"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <fieldset className="flex flex-col gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] p-3" data-testid="repeat-section">
            <label className="flex items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
              <input
                type="checkbox"
                checked={repeat}
                onChange={(e) => {
                  setRepeat(e.target.checked);
                  setPreview(null);
                }}
                className="h-4 w-4"
                data-testid="repeat-toggle"
              />
              Repeat this booking (a course of visits)
            </label>
            {repeat && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  Every
                  <select
                    value={intervalWeeks}
                    onChange={(e) => {
                      setIntervalWeeks(Number(e.target.value));
                      setPreview(null);
                    }}
                    className="rounded border border-[var(--color-ink)]/20 px-2 py-1.5 text-sm"
                    data-testid="repeat-interval"
                  >
                    {[1, 2, 3, 4, 6, 8, 12].map((w) => (
                      <option key={w} value={w}>
                        {w === 1 ? "week" : `${w} weeks`}
                      </option>
                    ))}
                  </select>
                  ×
                  <input
                    type="number"
                    min={2}
                    max={26}
                    value={count}
                    onChange={(e) => {
                      setCount(Math.max(2, Math.min(26, Number(e.target.value) || 2)));
                      setPreview(null);
                    }}
                    className="w-20 rounded border border-[var(--color-ink)]/20 px-2 py-1.5 text-sm"
                    data-testid="repeat-count"
                  />
                  visits, same time
                  <button type="button" onClick={checkDates} disabled={checking || !selectedSlot} className="lunia-btn lunia-btn-ghost lunia-btn-sm" data-testid="repeat-check">
                    {checking ? "Checking…" : "Check dates"}
                  </button>
                </div>
                {preview && (
                  <ul className="grid gap-1 text-sm sm:grid-cols-2" data-testid="repeat-preview">
                    {preview.map((o) => (
                      <li key={o.startAt} className={o.available ? "text-[var(--color-ink)]" : "text-[var(--color-danger)]"}>
                        {o.available ? "✓" : "✗"} {dFmt.format(new Date(o.startAt))}
                        {!o.available && " — not free, will be skipped"}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </fieldset>

          {error && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm font-medium text-[var(--color-teal-ink)]" data-testid="walk-in-success">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending || !selectedSlot}
            className="w-fit lunia-btn lunia-btn-forest disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending
              ? "Booking…"
              : repeat
                ? preview
                  ? `Book ${preview.filter((o) => o.available).length} visits`
                  : "Check dates"
                : "Confirm walk-in"}
          </button>
        </>
      )}
    </form>
  );
}
