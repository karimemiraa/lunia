"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addWalkupWaitlistAction } from "./actions";

export interface WaitlistServiceDTO {
  id: string;
  name: string;
  departmentName: string;
}

interface WaitlistAddFormProps {
  services: WaitlistServiceDTO[];
  defaultDate: string;
}

const inputClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

const labelClass = "flex flex-col gap-1 text-sm";

// Front-desk "walk-up" waitlist add: staff record a client's interest in a
// service+day when there is no free slot right now, without requiring the
// public wizard's OTP verification. Mirrors WalkInForm.tsx's grouped-service
// picker; the actual persistence goes through joinWaitlist (via
// addWalkupWaitlistAction).
export function WaitlistAddForm({ services, defaultDate }: WaitlistAddFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? "");
  const [desiredDate, setDesiredDate] = useState(defaultDate);
  const [desiredWindow, setDesiredWindow] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const dateId = useId();
  const windowId = useId();
  const nameId = useId();
  const phoneId = useId();
  const emailId = useId();

  const groupedServices = useMemo(() => {
    const byDept = new Map<string, WaitlistServiceDTO[]>();
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

    if (!serviceId || !desiredDate) {
      setError("Choose a service and a desired date.");
      return;
    }
    if (!name.trim() || (!phone.trim() && !email.trim())) {
      setError("Client name and a phone or email are required.");
      return;
    }

    startTransition(async () => {
      const result = await addWalkupWaitlistAction({
        serviceId,
        desiredDateISO: desiredDate,
        desiredWindow: desiredWindow || undefined,
        name,
        phone: phone || undefined,
        email: email || undefined,
      });
      if (result.ok) {
        setSuccess(true);
        setName("");
        setPhone("");
        setEmail("");
        setDesiredWindow("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="waitlist-add-form"
      className="flex flex-col gap-4 lunia-card p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-[var(--color-ink)]">Add a walk-up to the waitlist</h2>
        <p className="text-sm text-[var(--color-ink)]/60">
          Record a client&rsquo;s interest in a service on a day with no free slot. They&rsquo;ll be notified automatically
          the moment a slot on that day opens up.
        </p>
      </div>

      {services.length === 0 ? (
        <p className="text-sm text-[var(--color-ink)]/60">No published services available.</p>
      ) : (
        <>
          <label className={labelClass}>
            <span className="font-medium text-[var(--color-ink)]">Service</span>
            <select value={serviceId} onChange={(event) => setServiceId(event.target.value)} className={inputClass}>
              {groupedServices.map(([departmentName, deptServices]) => (
                <optgroup key={departmentName} label={departmentName}>
                  {deptServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass} htmlFor={dateId}>
              <span className="font-medium text-[var(--color-ink)]">Desired date</span>
              <input
                id={dateId}
                type="date"
                required
                value={desiredDate}
                onChange={(event) => setDesiredDate(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass} htmlFor={windowId}>
              <span className="font-medium text-[var(--color-ink)]">Preferred time (optional)</span>
              <input
                id={windowId}
                type="text"
                placeholder="e.g. morning, after 5pm"
                value={desiredWindow}
                onChange={(event) => setDesiredWindow(event.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className={labelClass} htmlFor={nameId}>
              <span className="font-medium text-[var(--color-ink)]">Client name</span>
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
              <span className="font-medium text-[var(--color-ink)]">Phone</span>
              <input
                id={phoneId}
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass} htmlFor={emailId}>
              <span className="font-medium text-[var(--color-ink)]">Email</span>
              <input
                id={emailId}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          {error && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          {success && <p className="text-sm font-medium text-[var(--color-teal)]">Added to the waitlist.</p>}

          <button
            type="submit"
            disabled={isPending}
            className="w-fit lunia-btn lunia-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Adding…" : "Add to waitlist"}
          </button>
        </>
      )}
    </form>
  );
}
