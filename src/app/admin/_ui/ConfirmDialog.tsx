"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Spinner } from "./Form";
import "./tokens.css";

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input:not([type="hidden"]),select,[tabindex]:not([tabindex="-1"])';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, in one or two sentences. */
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Danger styles the confirm button and separates it from the cancel. */
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Optional extra content (e.g. a reason field). */
  children?: ReactNode;
}

/**
 * Accessible confirm dialog: role=alertdialog, labelled by its title, focus
 * moves in on open and is trapped, Escape and backdrop cancel, focus returns
 * to the trigger on close. Replaces native confirm() everywhere in admin.
 */
export function ConfirmDialog({ open, title, description, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false, pending = false, onConfirm, onCancel, children }: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  // Portals need the DOM; on the server this reads false so nothing renders.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Cancel is the safe default focus for destructive dialogs.
    const t = setTimeout(() => {
      const cancel = panel.current?.querySelector<HTMLElement>("[data-cancel]");
      (cancel ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    }, 0);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      restoreTo.current?.focus?.();
    };
  }, [open]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (!pending) onCancel();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => !n.hasAttribute("disabled"));
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onCancel, pending],
  );

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[var(--color-ink)]/45 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        onKeyDown={onKeyDown}
        className="lx-dialog w-full max-w-md rounded-[var(--radius-lg)] bg-[var(--surface)] p-6 shadow-[var(--shadow-lg)]"
      >
        <h2 id={titleId} className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">
          {title}
        </h2>
        {description && (
          <p id={descId} className="mt-2 text-sm leading-relaxed text-[var(--color-ink)]/70">
            {description}
          </p>
        )}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" data-cancel onClick={onCancel} disabled={pending} className="lunia-btn lunia-btn-ghost min-h-11 disabled:opacity-60">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending || undefined}
            className={`lunia-btn min-h-11 disabled:opacity-60 ${danger ? "lunia-btn-danger" : "lunia-btn-forest"}`}
          >
            {pending && <Spinner />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmButtonProps {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Runs on confirm. When omitted, the button submits its form (with formAction if given). */
  onConfirm?: () => void | Promise<void>;
  formAction?: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  pending?: boolean;
  "aria-label"?: string;
}

/**
 * A button that asks first. In a form it submits (honouring formAction) after
 * confirmation; otherwise it calls onConfirm.
 */
export function ConfirmButton({ title, description, confirmLabel, danger = true, onConfirm, formAction, children, className, disabled, pending, ...aria }: ConfirmButtonProps) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const cls = className ?? `lunia-btn ${danger ? "lunia-btn-danger" : "lunia-btn-forest-outline"} lunia-btn-sm min-h-11`;

  async function confirm() {
    setOpen(false);
    if (onConfirm) {
      await onConfirm();
      return;
    }
    const form = btn.current?.form;
    if (form) form.requestSubmit(btn.current);
  }

  return (
    <>
      <button
        ref={btn}
        type={onConfirm ? "button" : "submit"}
        formAction={formAction}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        onClick={(e) => {
          // A confirmed requestSubmit() bypasses this handler, so a click
          // here is always the first ask.
          e.preventDefault();
          setOpen(true);
        }}
        className={`${cls} disabled:opacity-60`}
        {...aria}
      >
        {pending && <Spinner />}
        {children}
      </button>
      <ConfirmDialog open={open} title={title} description={description} confirmLabel={confirmLabel ?? (typeof children === "string" ? children : "Confirm")} danger={danger} onConfirm={confirm} onCancel={() => setOpen(false)} />
    </>
  );
}
