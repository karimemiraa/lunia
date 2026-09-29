"use client";

import { useEffect, useRef, useState, type FormHTMLAttributes, type ReactNode, type SubmitEvent } from "react";
import { useFormStatus } from "react-dom";
import "./tokens.css";

/** Focuses the first invalid control in a form; returns false when none. */
export function focusFirstInvalid(form: HTMLFormElement): boolean {
  if (form.checkValidity()) return false;
  const first = form.querySelector<HTMLElement>(":invalid:not(fieldset)");
  first?.focus();
  first?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  return true;
}

/**
 * Warns before leaving a page with unsaved edits. Returns a `markClean`
 * callback for after a successful save.
 */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome requires returnValue for the prompt to show.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

interface FormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, "noValidate"> {
  children: ReactNode;
  /** Ask before navigating away once any field changed (long forms). */
  guardUnsaved?: boolean;
}

/**
 * A form that keeps native constraint validation but shows errors inline
 * (see Field.tsx) and focuses the first invalid field on submit instead of
 * showing the browser bubble. Works with server actions (`action={fn}`) and
 * with onSubmit handlers alike.
 */
export function Form({ children, guardUnsaved = false, onSubmit, onChange, ...rest }: FormProps) {
  const ref = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(guardUnsaved && dirty);

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    if (focusFirstInvalid(form)) {
      e.preventDefault();
      return;
    }
    setDirty(false);
    onSubmit?.(e);
  }

  return (
    <form
      ref={ref}
      noValidate
      onSubmit={handleSubmit}
      onChange={(e) => {
        onChange?.(e);
        if (guardUnsaved) setDirty(true);
      }}
      {...rest}
    >
      {children}
    </form>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANT_CLASS: Record<Variant, string> = {
  primary: "lunia-btn-forest",
  secondary: "lunia-btn-forest-outline",
  ghost: "lunia-btn-ghost",
  danger: "lunia-btn-danger",
};

interface SubmitButtonProps {
  children: ReactNode;
  pendingLabel?: ReactNode;
  variant?: Variant;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  /** For buttons that override the form's action. */
  formAction?: (formData: FormData) => void | Promise<void>;
  name?: string;
  value?: string;
  /** Pending state for non-form flows (useTransition). */
  pending?: boolean;
}

/** Submit button that shows a pending state while its form is submitting. */
export function SubmitButton({ children, pendingLabel, variant = "primary", size = "md", className = "", disabled, formAction, name, value, pending: forced }: SubmitButtonProps) {
  const status = useFormStatus();
  const pending = forced ?? status.pending;
  return (
    <button
      type="submit"
      formAction={formAction}
      name={name}
      value={value}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`lunia-btn ${VARIANT_CLASS[variant]} ${size === "sm" ? "lunia-btn-sm min-h-11" : "min-h-11"} disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {pending && <Spinner />}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${className} animate-spin motion-reduce:animate-none`}>
      <path strokeLinecap="round" d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

/**
 * Inline success/error feedback with a live region. The shell's toast (when
 * merged) can replace this; until then every form reports the same way.
 */
export function InlineStatus({ success, error, className = "" }: { success?: ReactNode; error?: ReactNode; className?: string }) {
  if (!success && !error) return null;
  if (error) {
    return (
      <p role="alert" className={`rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,#d92d20_35%,transparent)] bg-[var(--status-danger-bg)] px-4 py-3 text-sm text-[var(--status-danger-ink)] ${className}`}>
        {error}
      </p>
    );
  }
  return (
    <p role="status" aria-live="polite" className={`inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--status-success-bg)] px-4 py-2.5 text-sm font-medium text-[var(--status-success-ink)] ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
      {success}
    </p>
  );
}

/** Non-blocking notice (warnings, hints) in the same voice as InlineStatus. */
export function Notice({ tone = "warning", children, className = "" }: { tone?: "warning" | "info"; children: ReactNode; className?: string }) {
  const cls = tone === "warning" ? "bg-[var(--status-warning-bg)] text-[var(--status-warning-ink)]" : "bg-[var(--status-info-bg)] text-[var(--status-info-ink)]";
  return <p className={`rounded-[var(--radius-sm)] px-4 py-3 text-sm ${cls} ${className}`}>{children}</p>;
}
