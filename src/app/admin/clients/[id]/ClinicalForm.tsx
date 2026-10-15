"use client";

import { useActionState } from "react";
import { saveClinicalAction, type ClientActionState } from "./actions";
import { InlineStatus } from "../../_ui/Form";
import { useStaffT } from "../../_i18n/StaffI18n";

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
  const t = useStaffT();
  const [state, action, pending] = useActionState(saveClinicalAction, initialState);

  return (
    <form action={action} data-testid="clinical-form" className="flex flex-col gap-5 lunia-card p-5">
      <input type="hidden" name="clientProfileId" value={clientProfileId} />

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>{t("Tags")}</span>
        <input name="tags" defaultValue={tags.join(", ")} placeholder={t("VIP, bride, sensitive skin")} className={inputClass} />
        <span className="text-xs text-[var(--color-ink)]/45">{t("Comma-separated. Used for segments and filtering the roster.")}</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{t("Skin type")}</span>
          <select name="skinType" defaultValue={skinType ?? ""} className={inputClass}>
            {SKIN_TYPES.map((type) => (
              <option key={type} value={type}>
                {type ? t(type) : t("None")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{t("Concerns")}</span>
          <input
            name="skinConcerns"
            defaultValue={skinConcerns.join(", ")}
            placeholder={t("pigmentation, acne, redness")}
            className={inputClass}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>{t("Allergies / sensitivities")}</span>
        <input name="allergies" defaultValue={allergies ?? ""} placeholder={t("e.g. fragrance, salicylic acid")} className={inputClass} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>{t("Clinical notes")}</span>
        <textarea
          name="clinicalNotes"
          defaultValue={clinicalNotes ?? ""}
          rows={3}
          placeholder={t("Standing clinical context (not tied to a single visit).")}
          className={inputClass}
        />
      </label>

      <fieldset className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] p-4">
        <legend className={`${labelClass} px-1`}>{t("Consent (PDPL)")}</legend>
        <label className="flex items-center gap-2.5 text-sm text-[var(--color-ink)]">
          <input type="checkbox" name="consentTreatment" defaultChecked={consentTreatment} className="h-4 w-4 accent-[var(--color-teal)]" />
          {t("Consents to treatment")}
        </label>
        <label className="flex items-center gap-2.5 text-sm text-[var(--color-ink)]">
          <input type="checkbox" name="consentData" defaultChecked={consentData} className="h-4 w-4 accent-[var(--color-teal)]" />
          {t("Consents to storing personal & clinical data")}
        </label>
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="lunia-btn lunia-btn-primary disabled:opacity-60">
          {pending ? t("Saving…") : t("Save clinical profile")}
        </button>
        <InlineStatus size="sm" success={state.success ? t("Saved.") : undefined} />
        <InlineStatus size="sm" error={state.error} />
      </div>
    </form>
  );
}
