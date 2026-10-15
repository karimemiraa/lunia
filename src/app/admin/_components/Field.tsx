"use client";

import { useStaffT } from "../_i18n/StaffI18n";

interface FieldProps {
  label: string;
  name: string;
  type?: "text" | "email" | "password" | "number" | "url" | "tel" | "textarea";
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  /** Only applies to type="number"; e.g. "0.01" to allow decimals. */
  step?: string;
  /** Text direction, e.g. "rtl" for Arabic inputs. */
  dir?: "rtl" | "ltr";
}

const inputClass = "lunia-input";

export function Field({ label, name, type = "text", defaultValue, placeholder, required, step, dir }: FieldProps) {
  const t = useStaffT();
  // Emails, URLs and phone numbers read left-to-right even in Arabic.
  const fieldDir = dir ?? (type === "email" || type === "url" || type === "tel" ? "ltr" : undefined);
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">{t(label)}</span>
      {type === "textarea" ? (
        <textarea
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder && t(placeholder)}
          required={required}
          rows={4}
          dir={fieldDir}
          className={inputClass}
        />
      ) : (
        <input
          type={type}
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder && t(placeholder)}
          required={required}
          step={type === "number" ? step : undefined}
          dir={fieldDir}
          className={inputClass}
        />
      )}
    </label>
  );
}
