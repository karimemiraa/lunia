"use client";

import { useId, useState, type ReactNode } from "react";
import { FieldShell, inputClass } from "./Field";

/**
 * Password-style input with a show/hide toggle for API keys and tokens.
 * Never prefills a stored secret: shows the masked hint as a placeholder.
 */
export function SecretInput({ label, name, hint, isSet, help, required, placeholder, autoComplete = "off", error }: { label: ReactNode; name: string; hint?: string | null; isSet?: boolean; help?: ReactNode; required?: boolean; placeholder?: string; autoComplete?: string; error?: ReactNode }) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <FieldShell
      label={label}
      htmlFor={id}
      required={required}
      help={help}
      error={error}
      helpId={`${id}-help`}
      errorId={`${id}-error`}
      trailing={
        isSet ? (
          <span className="rounded-full bg-[var(--status-success-bg)] px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--status-success-ink)]">Set</span>
        ) : (
          <span className="rounded-full bg-[var(--status-neutral-bg)] px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--status-neutral-ink)]">Not set</span>
        )
      }
    >
      <div className="relative">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          spellCheck={false}
          required={required}
          placeholder={isSet ? `${hint ?? "••••"} — leave blank to keep` : placeholder ?? ""}
          aria-describedby={help ? `${id}-help` : undefined}
          className={`${inputClass} pe-20 font-mono`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-pressed={show}
          className="absolute inset-y-1 end-1 inline-flex min-w-[4.25rem] items-center justify-center rounded-full px-3 text-xs font-medium text-[var(--color-teal-ink)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)]"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </FieldShell>
  );
}
