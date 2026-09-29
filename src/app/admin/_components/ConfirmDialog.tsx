"use client";

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "./toast";

interface ConfirmDialogProps {
  /** The trigger's label (or custom content). */
  children: ReactNode;
  /** Dialog heading, e.g. "Delete this invoice?" */
  title: string;
  /** One or two sentences on what happens. */
  description?: string;
  /** The danger verb on the confirm button, e.g. "Delete", "Void", "Cancel booking". */
  verb: string;
  /** Called on confirm. Server actions (bound with FormData or none) are fine. */
  onConfirm: () => void | Promise<unknown>;
  /** Non-destructive confirms use the primary style instead of danger. */
  tone?: "danger" | "primary";
  /** Trigger button classes (default: quiet danger). */
  className?: string;
  /** Optional toast shown after a successful confirm. */
  successMessage?: string;
  disabled?: boolean;
}

/**
 * Accessible confirm dialog for destructive actions: focus is trapped, Esc
 * cancels, focus returns to the trigger, the confirm button shows a pending
 * state while the action runs. Replaces window.confirm() across the admin.
 */
export function ConfirmDialog({
  children,
  title,
  description,
  verb,
  onConfirm,
  tone = "danger",
  className,
  successMessage,
  disabled,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  function close() {
    setOpen(false);
    setError(null);
    // Return focus to the trigger after the portal unmounts.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        await onConfirm();
        if (successMessage) toast({ title: successMessage, tone: "success" });
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={className ?? (tone === "danger" ? "lunia-btn lunia-btn-danger lunia-btn-sm" : "lunia-btn lunia-btn-forest-outline lunia-btn-sm")}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--color-ink)]/45 p-4 backdrop-blur-sm sm:items-center sm:p-6"
            onClick={(e) => {
              if (e.target === e.currentTarget && !pending) close();
            }}
          >
            <div
              ref={panelRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={description ? descId : undefined}
              className="lunia-pop-in w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-lg)]"
            >
              <div className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    tone === "danger" ? "bg-[var(--status-danger-bg)] text-[var(--status-danger)]" : "bg-[var(--status-info-bg)] text-[var(--status-info)]"
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M12 8v5M12 16.5v.5M12 3l9.5 17h-19L12 3Z" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="font-[family-name:var(--font-display)] text-xl leading-snug text-[var(--color-ink)]">
                    {title}
                  </h2>
                  {description && (
                    <p id={descId} className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink)]/65">
                      {description}
                    </p>
                  )}
                  {error && (
                    <p role="alert" className="mt-3 rounded-[var(--radius-sm)] bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger)]">
                      {error}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button ref={cancelRef} type="button" onClick={close} disabled={pending} className="lunia-btn lunia-btn-ghost">
                  Keep
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={pending}
                  aria-busy={pending}
                  className={`lunia-btn ${tone === "danger" ? "lunia-btn-danger" : "lunia-btn-forest"} disabled:opacity-60`}
                >
                  {pending ? "Working…" : verb}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
