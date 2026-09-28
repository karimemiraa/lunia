"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import "./tokens.css";

import { errorTextClass, helpTextClass, inputClass, invalidInputClass, labelTextClass } from "./labels";

export { errorTextClass, helpTextClass, inputClass, invalidInputClass, labelTextClass };

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className={errorTextClass}>
      {children}
    </p>
  );
}

interface ShellProps {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  help?: ReactNode;
  error?: ReactNode;
  helpId?: string;
  errorId?: string;
  className?: string;
  /** Right-hand slot next to the label (e.g. a status pill or "show" toggle). */
  trailing?: ReactNode;
  children: ReactNode;
}

/** Label + control + help + error, with the aria wiring done for you. */
export function FieldShell({ label, htmlFor, required, help, error, helpId, errorId, className = "", trailing, children }: ShellProps) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 text-sm ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className={labelTextClass}>
          {label}
          {required && (
            <span aria-hidden="true" className="ms-1 text-[var(--status-danger-ink)]">
              *
            </span>
          )}
        </label>
        {trailing}
      </div>
      {children}
      {help && !error && (
        <p id={helpId} className={helpTextClass}>
          {help}
        </p>
      )}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

type Native = InputHTMLAttributes<HTMLInputElement>;

export interface FieldProps extends Omit<Native, "type" | "className" | "children" | "prefix"> {
  label: ReactNode;
  name: string;
  type?: "text" | "email" | "password" | "number" | "url" | "tel" | "date" | "time" | "datetime-local" | "search" | "month";
  help?: ReactNode;
  /** Server-side error for this field (wins over the inline validation). */
  error?: ReactNode;
  className?: string;
  inputClassName?: string;
  trailing?: ReactNode;
  /** Suffix rendered inside the control (e.g. "SAR", "%"). */
  suffix?: ReactNode;
  /** Prefix rendered inside the control. */
  prefix?: ReactNode;
}

/**
 * Labelled input with helper text, a required marker, inline validation on
 * blur (native constraints → message next to the field) and aria-describedby
 * wiring. Works uncontrolled in server-action forms or controlled with
 * value/onChange.
 */
export function Field({ label, name, type = "text", help, error, required, className, inputClassName = "", trailing, suffix, prefix, onBlur, onInvalid, onChange, id, ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? `${name}-${autoId}`;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const [localError, setLocalError] = useState<string | null>(null);
  const shown = error ?? localError;

  const describedBy = [help && !shown ? helpId : null, shown ? errorId : null].filter(Boolean).join(" ") || undefined;

  const control = (
    <input
      id={inputId}
      name={name}
      type={type}
      required={required}
      aria-invalid={shown ? true : undefined}
      aria-describedby={describedBy}
      className={`${inputClass} ${shown ? invalidInputClass : ""} ${prefix ? "ps-9" : ""} ${suffix ? "pe-12" : ""} ${inputClassName}`}
      onBlur={(e) => {
        onBlur?.(e);
        if (e.defaultPrevented) return;
        setLocalError(e.currentTarget.checkValidity() ? null : e.currentTarget.validationMessage);
      }}
      onInvalid={(e) => {
        onInvalid?.(e);
        // Form.tsx calls checkValidity() with noValidate on the form, so the
        // browser bubble never shows — we surface the message ourselves.
        e.preventDefault();
        setLocalError(e.currentTarget.validationMessage);
      }}
      onChange={(e) => {
        onChange?.(e);
        if (localError && e.currentTarget.checkValidity()) setLocalError(null);
      }}
      {...rest}
    />
  );

  return (
    <FieldShell label={label} htmlFor={inputId} required={required} help={help} error={shown} helpId={helpId} errorId={errorId} className={className} trailing={trailing}>
      {prefix || suffix ? (
        <div className="relative">
          {prefix && <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm text-[var(--color-ink)]/50">{prefix}</span>}
          {control}
          {suffix && <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-[var(--color-ink)]/50">{suffix}</span>}
        </div>
      ) : (
        control
      )}
    </FieldShell>
  );
}

export interface TextareaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "children"> {
  label: ReactNode;
  name: string;
  help?: ReactNode;
  error?: ReactNode;
  className?: string;
  inputClassName?: string;
  trailing?: ReactNode;
}

export function TextareaField({ label, name, help, error, required, className, inputClassName = "", trailing, rows = 4, onBlur, onInvalid, id, ...rest }: TextareaFieldProps) {
  const autoId = useId();
  const inputId = id ?? `${name}-${autoId}`;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const [localError, setLocalError] = useState<string | null>(null);
  const shown = error ?? localError;
  const describedBy = [help && !shown ? helpId : null, shown ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <FieldShell label={label} htmlFor={inputId} required={required} help={help} error={shown} helpId={helpId} errorId={errorId} className={className} trailing={trailing}>
      <textarea
        id={inputId}
        name={name}
        rows={rows}
        required={required}
        aria-invalid={shown ? true : undefined}
        aria-describedby={describedBy}
        className={`lunia-input text-base md:text-sm ${shown ? invalidInputClass : ""} ${inputClassName}`}
        onBlur={(e) => {
          onBlur?.(e);
          if (!e.defaultPrevented) setLocalError(e.currentTarget.checkValidity() ? null : e.currentTarget.validationMessage);
        }}
        onInvalid={(e) => {
          onInvalid?.(e);
          e.preventDefault();
          setLocalError(e.currentTarget.validationMessage);
        }}
        {...rest}
      />
    </FieldShell>
  );
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> {
  label: ReactNode;
  name: string;
  help?: ReactNode;
  error?: ReactNode;
  className?: string;
  inputClassName?: string;
  trailing?: ReactNode;
}

export function SelectField({ label, name, help, error, required, className, inputClassName = "", trailing, children, id, onInvalid, ...rest }: SelectFieldProps) {
  const autoId = useId();
  const inputId = id ?? `${name}-${autoId}`;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const [localError, setLocalError] = useState<string | null>(null);
  const shown = error ?? localError;
  const describedBy = [help && !shown ? helpId : null, shown ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <FieldShell label={label} htmlFor={inputId} required={required} help={help} error={shown} helpId={helpId} errorId={errorId} className={className} trailing={trailing}>
      <select
        id={inputId}
        name={name}
        required={required}
        aria-invalid={shown ? true : undefined}
        aria-describedby={describedBy}
        className={`${inputClass} ${shown ? invalidInputClass : ""} ${inputClassName}`}
        onInvalid={(e) => {
          onInvalid?.(e);
          e.preventDefault();
          setLocalError(e.currentTarget.validationMessage);
        }}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

/** A 44px checkbox/switch row with the label as the hit target. */
export function CheckboxField({ label, name, help, className = "", ...rest }: { label: ReactNode; name: string; help?: ReactNode; className?: string } & Omit<Native, "type" | "className">) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm text-[var(--color-ink)]">
        <input id={id} type="checkbox" name={name} className="h-5 w-5 shrink-0 rounded accent-[var(--color-forest)]" {...rest} />
        <span>{label}</span>
      </label>
      {help && <p className={`${helpTextClass} ps-8`}>{help}</p>}
    </div>
  );
}
