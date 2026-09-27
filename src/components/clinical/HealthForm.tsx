"use client";

// The medical-history questionnaire, shared by the customer's account
// (/[locale]/account/health) and the admin patient file (staff filling it at
// the desk). Labels come from the "health" message namespace; the admin page
// wraps it in an English NextIntlClientProvider. Submission goes through the
// `onSubmit` server action the page passes in (which re-derives who may save
// for whom -- this component is only the form).

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  CONCERNS,
  CONDITIONS,
  HAIR_LOSS_DURATIONS,
  HAIR_LOSS_PATTERNS,
  MEDICATIONS,
  PROCEDURES,
  SKIN_TYPES,
  SUN_EXPOSURE,
  type IntakeAnswers,
} from "@/modules/clinical/intakeRules";

export type HealthFormResult = { ok: true } | { ok: false; error: string };

interface HealthFormProps {
  initial: IntakeAnswers;
  onSubmit: (answers: IntakeAnswers) => Promise<HealthFormResult>;
  /** Called after a successful save (e.g. navigate back). */
  onSaved?: () => void;
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-[var(--color-ink)]/15 bg-white px-3.5 py-2.5 text-[0.95rem] text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none focus:ring-2 focus:ring-[var(--color-teal)]/30";

function Section({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-[var(--color-ink)]/10 pt-6 first:border-t-0 first:pt-0">
      <legend className="contents">
        <span className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">{title}</span>
      </legend>
      {hint && <p className="-mt-2 text-sm text-[var(--color-ink)]/60">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Chip({ checked, onToggle, label, type = "checkbox", name }: { checked: boolean; onToggle: () => void; label: string; type?: "checkbox" | "radio"; name?: string }) {
  return (
    <label
      className={`inline-flex min-h-11 cursor-pointer select-none items-center rounded-full border px-4 py-2 text-sm transition-colors ${
        checked
          ? "border-[var(--color-teal)] bg-[var(--color-teal)]/15 text-[var(--color-ink)]"
          : "border-[var(--color-ink)]/15 text-[var(--color-ink)]/75 hover:border-[var(--color-ink)]/35"
      }`}
    >
      <input type={type} name={name} checked={checked} onChange={onToggle} className="sr-only" />
      {label}
    </label>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-medium text-[var(--color-ink)]/80">{children}</span>;
}

function YesNo({ value, onChange, name, yes, no }: { value: boolean; onChange: (v: boolean) => void; name: string; yes: string; no: string }) {
  return (
    <div className="flex gap-2">
      <Chip type="radio" name={name} checked={value} onToggle={() => onChange(true)} label={yes} />
      <Chip type="radio" name={name} checked={!value} onToggle={() => onChange(false)} label={no} />
    </div>
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function HealthForm({ initial, onSubmit, onSaved }: HealthFormProps) {
  const t = useTranslations("health");
  const [a, setA] = useState<IntakeAnswers>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof IntakeAnswers>(key: K, value: IntakeAnswers[K]) => {
    setSaved(false);
    setA((prev) => ({ ...prev, [key]: value }));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await onSubmit(a);
      if (result.ok) {
        setSaved(true);
        onSaved?.();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8" data-testid="health-form">
      <Section title={t("sections.skin")}>
        <div className="flex flex-col gap-2">
          <Label>{t("fields.skinType")}</Label>
          <div className="flex flex-wrap gap-2">
            {SKIN_TYPES.map((k) => (
              <Chip key={k} type="radio" name="skinType" checked={a.skinType === k} onToggle={() => set("skinType", k)} label={t(`skinTypes.${k}`)} />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label>{t("fields.concerns")}</Label>
          <div className="flex flex-wrap gap-2">
            {CONCERNS.map((k) => (
              <Chip key={k} checked={a.concerns.includes(k)} onToggle={() => set("concerns", toggle(a.concerns, k))} label={t(`concerns.${k}`)} />
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-2">
          <Label>{t("fields.goals")}</Label>
          <textarea rows={2} value={a.goals} onChange={(e) => set("goals", e.target.value)} placeholder={t("fields.goalsPlaceholder")} className={inputClass} maxLength={1000} />
        </label>
      </Section>

      <Section title={t("sections.health")}>
        <div className="flex flex-col gap-2">
          <Label>{t("fields.conditions")}</Label>
          <div className="flex flex-wrap gap-2">
            {CONDITIONS.map((k) => (
              <Chip key={k} checked={a.conditions.includes(k)} onToggle={() => set("conditions", toggle(a.conditions, k))} label={t(`conditions.${k}`)} />
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-2">
          <Label>{t("fields.conditionsOther")}</Label>
          <input value={a.conditionsOther} onChange={(e) => set("conditionsOther", e.target.value)} className={inputClass} maxLength={500} />
        </label>
      </Section>

      <Section title={t("sections.medications")}>
        <div className="flex flex-col gap-2">
          <Label>{t("fields.medications")}</Label>
          <div className="flex flex-wrap gap-2">
            {MEDICATIONS.map((k) => (
              <Chip key={k} checked={a.medications.includes(k)} onToggle={() => set("medications", toggle(a.medications, k))} label={t(`medications.${k}`)} />
            ))}
          </div>
        </div>
        {a.medications.includes("isotretinoin") && (
          <label className="flex flex-col gap-2 sm:max-w-xs">
            <Label>{t("fields.isotretinoinLastDose")}</Label>
            <input type="date" value={a.isotretinoinLastDose} onChange={(e) => set("isotretinoinLastDose", e.target.value)} className={inputClass} />
          </label>
        )}
        <label className="flex flex-col gap-2">
          <Label>{t("fields.medicationsOther")}</Label>
          <input value={a.medicationsOther} onChange={(e) => set("medicationsOther", e.target.value)} className={inputClass} maxLength={500} />
        </label>
      </Section>

      <Section title={t("sections.allergies")}>
        <label className="flex flex-col gap-2">
          <Label>{t("fields.allergies")}</Label>
          <input value={a.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder={t("fields.allergiesPlaceholder")} className={inputClass} maxLength={500} />
        </label>
      </Section>

      <Section title={t("sections.pregnancy")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>{t("fields.pregnant")}</Label>
            <YesNo name="pregnant" value={a.pregnant} onChange={(v) => set("pregnant", v)} yes={t("fields.yes")} no={t("fields.no")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("fields.breastfeeding")}</Label>
            <YesNo name="breastfeeding" value={a.breastfeeding} onChange={(v) => set("breastfeeding", v)} yes={t("fields.yes")} no={t("fields.no")} />
          </div>
        </div>
      </Section>

      <Section title={t("sections.procedures")} hint={t("fields.proceduresHint")}>
        {a.recentProcedures.map((p, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-40 flex-1 flex-col gap-2">
              <Label>{t("fields.procedureKind")}</Label>
              <select
                value={p.kind}
                onChange={(e) =>
                  set(
                    "recentProcedures",
                    a.recentProcedures.map((x, j) => (j === i ? { ...x, kind: e.target.value as (typeof PROCEDURES)[number] } : x)),
                  )
                }
                className={inputClass}
              >
                {PROCEDURES.map((k) => (
                  <option key={k} value={k}>
                    {t(`procedures.${k}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-2">
              <Label>{t("fields.procedureDate")}</Label>
              <input
                type="date"
                value={p.date}
                onChange={(e) => set("recentProcedures", a.recentProcedures.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))}
                className={inputClass}
              />
            </label>
            <button
              type="button"
              onClick={() => set("recentProcedures", a.recentProcedures.filter((_, j) => j !== i))}
              className="min-h-11 rounded-full px-4 text-sm text-red-700 hover:bg-red-50"
            >
              {t("fields.removeProcedure")}
            </button>
          </div>
        ))}
        {a.recentProcedures.length < 10 && (
          <button
            type="button"
            onClick={() => set("recentProcedures", [...a.recentProcedures, { kind: "laser", date: "", note: "" }])}
            className="min-h-11 self-start rounded-full border border-[var(--color-ink)]/20 px-5 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-ink)]/5"
          >
            {t("fields.addProcedure")}
          </button>
        )}
      </Section>

      <Section title={t("sections.sun")}>
        <div className="flex flex-col gap-2">
          <Label>{t("fields.sunExposure")}</Label>
          <div className="flex flex-wrap gap-2">
            {SUN_EXPOSURE.map((k) => (
              <Chip key={k} type="radio" name="sun" checked={a.sunExposure === k} onToggle={() => set("sunExposure", k)} label={t(`sunExposure.${k}`)} />
            ))}
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--color-ink)]/85">
          <input type="checkbox" checked={a.recentTan} onChange={(e) => set("recentTan", e.target.checked)} className="h-5 w-5 accent-[var(--color-teal)]" />
          {t("fields.recentTan")}
        </label>
      </Section>

      {a.concerns.includes("hairLoss") && (
        <Section title={t("sections.hair")}>
          <div className="flex flex-col gap-2">
            <Label>{t("fields.hairPattern")}</Label>
            <div className="flex flex-wrap gap-2">
              {HAIR_LOSS_PATTERNS.map((k) => (
                <Chip key={k} type="radio" name="hairPattern" checked={a.hair.lossPattern === k} onToggle={() => set("hair", { ...a.hair, lossPattern: k })} label={t(`hairPatterns.${k}`)} />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("fields.hairDuration")}</Label>
            <div className="flex flex-wrap gap-2">
              {HAIR_LOSS_DURATIONS.map((k) => (
                <Chip key={k} type="radio" name="hairDuration" checked={a.hair.duration === k} onToggle={() => set("hair", { ...a.hair, duration: k })} label={t(`hairDurations.${k}`)} />
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-2">
            <Label>{t("fields.hairNotes")}</Label>
            <textarea rows={2} value={a.hair.notes} onChange={(e) => set("hair", { ...a.hair, notes: e.target.value })} className={inputClass} maxLength={500} />
          </label>
        </Section>
      )}

      {a.concerns.includes("postSurgery") && (
        <Section title={t("sections.postSurgery")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <Label>{t("fields.surgeryType")}</Label>
              <input value={a.postSurgery.surgeryType} onChange={(e) => set("postSurgery", { ...a.postSurgery, surgeryType: e.target.value })} className={inputClass} maxLength={200} />
            </label>
            <label className="flex flex-col gap-2">
              <Label>{t("fields.surgeryDate")}</Label>
              <input type="date" value={a.postSurgery.surgeryDate} onChange={(e) => set("postSurgery", { ...a.postSurgery, surgeryDate: e.target.value })} className={inputClass} />
            </label>
            <label className="flex flex-col gap-2 sm:col-span-2">
              <Label>{t("fields.surgeon")}</Label>
              <input value={a.postSurgery.surgeon} onChange={(e) => set("postSurgery", { ...a.postSurgery, surgeon: e.target.value })} className={inputClass} maxLength={200} />
            </label>
            <label className="flex flex-col gap-2 sm:col-span-2">
              <Label>{t("fields.surgeonInstructions")}</Label>
              <textarea rows={3} value={a.postSurgery.instructions} onChange={(e) => set("postSurgery", { ...a.postSurgery, instructions: e.target.value })} className={inputClass} maxLength={1000} />
            </label>
          </div>
        </Section>
      )}

      <Section title={t("sections.notes")}>
        <label className="flex flex-col gap-2">
          <Label>{t("fields.notes")}</Label>
          <textarea rows={3} value={a.notes} onChange={(e) => set("notes", e.target.value)} className={inputClass} maxLength={1000} />
        </label>
      </Section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--color-ink)] px-8 text-sm font-medium tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? t("saving") : t("submit")}
        </button>
        {saved && (
          <p role="status" className="text-sm font-medium text-[var(--color-teal-ink,#2f6d67)]">
            {t("saved")}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
