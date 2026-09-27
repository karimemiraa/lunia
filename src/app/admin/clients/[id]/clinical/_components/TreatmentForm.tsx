"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TreatmentProduct, TreatmentSetting } from "@/modules/clinical/treatments";
import { saveTreatmentAction } from "../actions";

export interface TreatmentFormValues {
  appointmentId: string | null;
  serviceId: string;
  performedById: string;
  /** Center-local "YYYY-MM-DDTHH:mm". */
  performedAtLocal: string;
  settings: TreatmentSetting[];
  productsUsed: TreatmentProduct[];
  notes: string;
  skinReaction: string;
  /** "YYYY-MM-DD" or "". */
  followUpDate: string;
}

interface Option {
  id: string;
  label: string;
}

interface TreatmentFormProps {
  clientProfileId: string;
  recordId: string | null;
  initial: TreatmentFormValues;
  services: Option[];
  staff: Option[];
  products: (Option & { unit: string })[];
  appointmentLabel: string | null;
}

// Riyadh is UTC+3 with no DST: send explicit offsets so the server never
// guesses the timezone of a bare local date/time.
const withOffset = (local: string) => `${local}:00+03:00`;

// Starter keys for the protocol so staff aren't typing the same labels daily.
const SETTING_SUGGESTIONS = ["Device", "Mode / program", "Wavelength", "Fluence / energy", "Pulse", "Passes", "Depth", "Duration", "Area", "Pressure"];

export function TreatmentForm({ clientProfileId, recordId, initial, services, staff, products, appointmentLabel }: TreatmentFormProps) {
  const router = useRouter();
  const [v, setV] = useState<TreatmentFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof TreatmentFormValues>(k: K, value: TreatmentFormValues[K]) => setV((prev) => ({ ...prev, [k]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveTreatmentAction(clientProfileId, recordId, {
        appointmentId: v.appointmentId,
        serviceId: v.serviceId || null,
        performedById: v.performedById,
        performedAt: withOffset(v.performedAtLocal),
        settings: v.settings.filter((s) => s.key.trim()),
        productsUsed: v.productsUsed.filter((p) => p.name.trim()),
        notes: v.notes,
        skinReaction: v.skinReaction,
        followUpAt: v.followUpDate ? `${v.followUpDate}T09:00:00+03:00` : null,
      });
      if (result.ok) {
        router.push(`/admin/clients/${clientProfileId}/clinical/treatment/${result.id}?saved=1`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" data-testid="treatment-form">
      {appointmentLabel && (
        <p className="rounded-[var(--radius-sm)] bg-[var(--color-teal)]/12 px-4 py-2.5 text-sm text-[var(--color-ink)]">Linked appointment: {appointmentLabel}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60">Service</span>
          <select value={v.serviceId} onChange={(e) => set("serviceId", e.target.value)} className="lunia-input min-h-11">
            <option value="">Not listed / other</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60">Performed by</span>
          <select value={v.performedById} onChange={(e) => set("performedById", e.target.value)} className="lunia-input min-h-11" required>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60">Date and time</span>
          <input type="datetime-local" value={v.performedAtLocal} onChange={(e) => set("performedAtLocal", e.target.value)} className="lunia-input min-h-11" required />
        </label>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60">Settings / protocol</legend>
        <datalist id="setting-keys">
          {SETTING_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {v.settings.map((s, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <input
              list="setting-keys"
              placeholder="Setting"
              value={s.key}
              onChange={(e) => set("settings", v.settings.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
              className="lunia-input min-h-11 min-w-36 flex-1"
              maxLength={80}
            />
            <input
              placeholder="Value"
              value={s.value}
              onChange={(e) => set("settings", v.settings.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
              className="lunia-input min-h-11 min-w-36 flex-[2]"
              maxLength={300}
            />
            <button type="button" onClick={() => set("settings", v.settings.filter((_, j) => j !== i))} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11" aria-label="Remove setting">
              Remove
            </button>
          </div>
        ))}
        <button type="button" onClick={() => set("settings", [...v.settings, { key: "", value: "" }])} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11 self-start">
          Add setting
        </button>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60">Products used</legend>
        {v.productsUsed.map((p, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            {products.length > 0 && (
              <select
                value={p.productId ?? ""}
                onChange={(e) => {
                  const picked = products.find((x) => x.id === e.target.value);
                  set(
                    "productsUsed",
                    v.productsUsed.map((x, j) => (j === i ? { ...x, productId: picked?.id ?? null, name: picked ? picked.label : x.name, unit: picked ? picked.unit : x.unit } : x)),
                  );
                }}
                className="lunia-input min-h-11 min-w-40 flex-1"
                aria-label="Pick from inventory"
              >
                <option value="">Free text</option>
                {products.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            <input
              placeholder="Product"
              value={p.name}
              onChange={(e) => set("productsUsed", v.productsUsed.map((x, j) => (j === i ? { ...x, name: e.target.value, productId: null } : x)))}
              className="lunia-input min-h-11 min-w-40 flex-[2]"
              maxLength={160}
            />
            <input
              placeholder="Qty"
              value={p.qty}
              onChange={(e) => set("productsUsed", v.productsUsed.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
              className="lunia-input min-h-11 w-20"
              maxLength={40}
            />
            <input
              placeholder="Unit"
              value={p.unit}
              onChange={(e) => set("productsUsed", v.productsUsed.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))}
              className="lunia-input min-h-11 w-24"
              maxLength={20}
            />
            <button type="button" onClick={() => set("productsUsed", v.productsUsed.filter((_, j) => j !== i))} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11" aria-label="Remove product">
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set("productsUsed", [...v.productsUsed, { productId: null, name: "", qty: "", unit: "" }])}
          className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11 self-start"
        >
          Add product
        </button>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60">Skin reaction</span>
          <input value={v.skinReaction} onChange={(e) => set("skinReaction", e.target.value)} placeholder="e.g. mild erythema, settled in 20 min" className="lunia-input min-h-11" maxLength={500} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60">Follow-up date</span>
          <input type="date" value={v.followUpDate} onChange={(e) => set("followUpDate", e.target.value)} className="lunia-input min-h-11" />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60">Notes</span>
        <textarea rows={5} value={v.notes} onChange={(e) => set("notes", e.target.value)} className="lunia-input" maxLength={5000} />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-60">
          {pending ? "Saving…" : recordId ? "Save changes" : "Save treatment record"}
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
