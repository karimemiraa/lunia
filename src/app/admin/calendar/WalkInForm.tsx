"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { frontDeskBookAction, getCalendarSlotsAction, type CalendarSlotDTO } from "./actions";
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
export function WalkInForm({ services, defaultDate, defaultName = "", defaultPhone = "" }: WalkInFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [selectedSlot, setSelectedSlot] = useState<CalendarSlotDTO | null>(null);
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (!serviceId || !selectedSlot) {
      setError("Choose a service and an available time.");
      return;
    }
    if (!name.trim() || !phone.trim()) {
      setError("Customer name and phone are required.");
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
        setSuccess(true);
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
            onSelect={setSelectedSlot}
            fetchSlots={getCalendarSlotsAction}
            dateInputId={dateInputId}
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

          {error && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          {success && <p className="text-sm font-medium text-[var(--color-teal)]">Booking created.</p>}

          <button
            type="submit"
            disabled={isPending || !selectedSlot}
            className="w-fit lunia-btn lunia-btn-forest disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Booking…" : "Confirm walk-in"}
          </button>
        </>
      )}
    </form>
  );
}
