"use client";

interface FieldProps {
  label: string;
  name: string;
  type?: "text" | "email" | "password" | "number" | "url" | "tel" | "textarea";
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}

const inputClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

export function Field({ label, name, type = "text", defaultValue, placeholder, required }: FieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-[var(--color-ink)]">{label}</span>
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
          className={inputClass}
        />
      )}
    </label>
  );
}
