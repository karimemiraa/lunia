"use client";

import { useActionState, useId, useRef } from "react";
import { createPackageAction, type CommerceActionState } from "./actions";

interface ServiceOption {
  id: string;
  nameEn: string;
}

const initialState: CommerceActionState = {};

const inputClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

/** Creates a new sellable session package. Guarded by SETTINGS_MANAGE server-side. */
export function CreatePackageForm({ services }: { services: ServiceOption[] }) {
  const [state, action, pending] = useActionState(createPackageAction, initialState);
  const nameEnId = useId();
  const nameArId = useId();
  const serviceId = useId();
  const sessionsId = useId();
  const priceId = useId();
  const activeId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
      }}
      data-testid="create-package-form"
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label htmlFor={nameEnId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Name (English)</span>
          <input id={nameEnId} name="nameEn" type="text" required className={inputClass} />
        </label>
        <label htmlFor={nameArId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Name (Arabic)</span>
          <input id={nameArId} name="nameAr" type="text" dir="rtl" required className={inputClass} />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label htmlFor={serviceId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Service (optional)</span>
          <select id={serviceId} name="serviceId" defaultValue="" className={inputClass}>
            <option value="">Any service</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.nameEn}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor={sessionsId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Sessions</span>
          <input id={sessionsId} name="sessionsTotal" type="number" min={1} step={1} required className={inputClass} />
        </label>

        <label htmlFor={priceId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Price (SAR)</span>
          <input id={priceId} name="priceSar" type="number" min={0} step="0.01" required className={inputClass} />
        </label>
      </div>

      <label htmlFor={activeId} className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input id={activeId} name="isActive" type="checkbox" defaultChecked className="h-4 w-4" />
        Active (available for purchase)
      </label>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create package"}
        </button>
        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
        {state.success && <p className="text-sm text-[var(--color-teal)]">Saved.</p>}
      </div>
    </form>
  );
}
