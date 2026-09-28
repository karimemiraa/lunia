"use client";

import { useId, useState, type ReactNode } from "react";
import { FieldShell, inputClass, invalidInputClass } from "./Field";
import { minorToInput, parseSarToMinor } from "./money";

interface MoneyInputProps {
  label: ReactNode;
  /** Form field name; submits a decimal string ("249.50") the actions already parse. */
  name?: string;
  /** Uncontrolled initial value in halalas. */
  defaultMinor?: number | null;
  /** Controlled value (decimal string) + change handler with the parsed halalas. */
  value?: string;
  onChange?: (text: string, minor: number | null) => void;
  required?: boolean;
  help?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  placeholder?: string;
  /** Whether the entered amount includes VAT — shown next to the unit so it is never ambiguous. */
  vat?: "incl" | "excl";
  min?: number;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  id?: string;
  "aria-label"?: string;
}

/**
 * SAR amount input. Validates on blur (accepts 249, 249.5, 1,249.50), keeps
 * the value as a decimal string and reports halalas to the caller.
 */
export function MoneyInput({ label, name, defaultMinor, value, onChange, required, help, error, disabled, placeholder = "0.00", vat, min, className, inputClassName = "", autoFocus, id }: MoneyInputProps) {
  const autoId = useId();
  const inputId = id ?? `${name ?? "amount"}-${autoId}`;
  const [inner, setInner] = useState(() => minorToInput(defaultMinor ?? 0));
  const [localError, setLocalError] = useState<string | null>(null);
  const text = value ?? inner;
  const shown = error ?? localError;
  const errorId = `${inputId}-error`;
  const helpId = `${inputId}-help`;

  function validate(t: string) {
    if (!t.trim()) {
      setLocalError(required ? "Enter an amount." : null);
      return;
    }
    const minor = parseSarToMinor(t);
    if (minor === null) setLocalError("Enter an amount like 250 or 249.50.");
    else if (min !== undefined && minor < min) setLocalError(`Must be at least ${minorToInput(min) || "0"} SAR.`);
    else setLocalError(null);
  }

  return (
    <FieldShell label={label} htmlFor={inputId} required={required} help={help} error={shown} helpId={helpId} errorId={errorId} className={className}>
      <div className="relative">
        <input
          id={inputId}
          name={name}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          value={text}
          aria-invalid={shown ? true : undefined}
          aria-describedby={[help && !shown ? helpId : null, shown ? errorId : null].filter(Boolean).join(" ") || undefined}
          onChange={(e) => {
            const t = e.target.value;
            if (value === undefined) setInner(t);
            onChange?.(t, parseSarToMinor(t));
            if (localError) validate(t);
          }}
          onBlur={(e) => validate(e.target.value)}
          className={`${inputClass} pe-20 text-end tabular-nums ${shown ? invalidInputClass : ""} ${inputClassName}`}
        />
        <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center gap-1 text-xs text-[var(--color-ink)]/50">
          SAR{vat && <span className="text-[0.6rem] uppercase tracking-wide">{vat === "incl" ? "incl. VAT" : "excl. VAT"}</span>}
        </span>
      </div>
    </FieldShell>
  );
}
