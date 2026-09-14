"use client";

import { useActionState } from "react";
import { saveClinicalAction, type ClientActionState } from "./actions";

interface ClinicalFormProps {
  clientProfileId: string;
  tags: string[];
  skinType: string | null;
  skinConcerns: string[];
  allergies: string | null;
  clinicalNotes: string | null;
  consentTreatment: boolean;
  consentData: boolean;
}

const initialState: ClientActionState = {};

const inputClass =
  "w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none focus:ring-2 focus:ring-[var(--color-teal)]/30";
const labelClass = "text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60";

const SKIN_TYPES = ["", "Normal", "Dry", "Oily", "Combination", "Sensitive", "Acne-prone", "Mature"];

export function ClinicalForm({
  clientProfileId,
  tags,
  skinType,
  skinConcerns,
  allergies,
  clinicalNotes,
  consentTreatment,
  consentData,
}: ClinicalFormProps) {
  const [state, action, pending] = useActionState(saveClinicalAction, initialState);

  return (
    <form action={action} data-testid="clinical-form" className="flex flex-col gap-5 lunia-card p-5">
      <input type="hidden" name="clientProfileId" value={clientProfileId} />

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Tags</span>
        <input name="tags" defaultValue={tags.join(", ")} placeholder="VIP, bride, sensitive skin" className={inputClass} />
        <span className="text-xs text-[var(--color-ink)]/45">Comma-separated. Used for segments and filtering the roster.</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Skin type</span>
          <select name="skinType" defaultValue={skinType ?? ""} className={inputClass}>
            {SKIN_TYPES.map((t) => (
              <option key={t} value={t}>
                {t || "—"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Concerns</span>
          <input
            name="skinConcerns"
            defaultValue={skinConcerns.join(", ")}
            placeholder="pigmentation, acne, redness"
            className={inputClass}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Allergies / sensitivities</span>
        <input name="allergies" defaultValue={allergies ?? ""} placeholder="e.g. fragrance, salicylic acid" className={inputClass} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Clinical notes</span>
        <textarea
          name="clinicalNotes"
          defaultValue={clinicalNotes ?? ""}
          rows={3}
          placeholder="Standing clinical context (not tied to a single visit)."
          className={inputClass}
        />
      </label>

      <fieldset className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] p-4">
        <legend className={`${labelClass} px-1`}>Consent (PDPL)</legend>
        <label className="flex items-center gap-2.5 text-sm text-[var(--color-ink)]">
          <input type="checkbox" name="consentTreatment" defaultChecked={consentTreatment} className="h-4 w-4 accent-[var(--color-teal)]" />
          Consents to treatment
        </label>
        <label className="flex items-center gap-2.5 text-sm text-[var(--color-ink)]">
          <input type="checkbox" name="consentData" defaultChecked={consentData} className="h-4 w-4 accent-[var(--color-teal)]" />
          Consents to storing personal &amp; clinical data
        </label>
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="lunia-btn lunia-btn-primary disabled:opacity-60">
          {pending ? "Saving…" : "Save clinical profile"}
        </button>
        {state.success && <span className="text-sm font-medium text-[var(--color-teal-ink)]">Saved.</span>}
        {state.error && <span className="text-sm font-medium text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
