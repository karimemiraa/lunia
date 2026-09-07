"use client";
import { useState } from "react";

export interface LocalizedValue {
  en: string;
  ar: string;
}

interface LocalizedFieldProps {
  label: string;
  name: string;
  defaultValue?: LocalizedValue;
  type?: "text" | "textarea";
  required?: boolean;
  /** Called whenever either language's value changes, with the combined { en, ar } shape. */
  onChange?: (value: LocalizedValue) => void;
}

const inputClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

/**
 * A paired EN + AR input for localized content. Renders two named form
 * fields (`${name}.en` and `${name}.ar`) so plain FormData parsing on the
 * server yields both languages, while also tracking a combined { en, ar }
 * value for callers that want it live (e.g. a client-side preview).
 */
export function LocalizedField({ label, name, defaultValue, type = "text", required, onChange }: LocalizedFieldProps) {
  const [value, setValue] = useState<LocalizedValue>(defaultValue ?? { en: "", ar: "" });

  function update(lang: keyof LocalizedValue, next: string) {
    const combined = { ...value, [lang]: next };
    setValue(combined);
    onChange?.(combined);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-[var(--color-ink)]">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/70">
          English
          {type === "textarea" ? (
            <textarea
              name={`${name}.en`}
              value={value.en}
              required={required}
              dir="ltr"
              rows={4}
              onChange={(event) => update("en", event.target.value)}
              className={inputClass}
            />
          ) : (
            <input
              name={`${name}.en`}
              value={value.en}
              required={required}
              dir="ltr"
              onChange={(event) => update("en", event.target.value)}
              className={inputClass}
            />
          )}
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/70">
          Arabic
          {type === "textarea" ? (
            <textarea
              name={`${name}.ar`}
              value={value.ar}
              required={required}
              dir="rtl"
              rows={4}
              onChange={(event) => update("ar", event.target.value)}
              className={inputClass}
            />
          ) : (
            <input
              name={`${name}.ar`}
              value={value.ar}
              required={required}
              dir="rtl"
              onChange={(event) => update("ar", event.target.value)}
              className={inputClass}
            />
          )}
        </label>
      </div>
    </fieldset>
  );
}
