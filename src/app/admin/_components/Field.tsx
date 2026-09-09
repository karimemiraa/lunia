"use client";

interface FieldProps {
  label: string;
  name: string;
  type?: "text" | "email" | "password" | "number" | "url" | "tel" | "textarea";
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  /** Only applies to type="number"; e.g. "0.01" to allow decimals. */
  step?: string;
}

const inputClass = "lunia-input";

export function Field({ label, name, type = "text", defaultValue, placeholder, required, step }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">{label}</span>
      {type === "textarea" ? (
        <textarea
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          rows={4}
          className={inputClass}
        />
      ) : (
        <input
          type={type}
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          step={type === "number" ? step : undefined}
          className={inputClass}
        />
      )}
    </label>
  );
}
