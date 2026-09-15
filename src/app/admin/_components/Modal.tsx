"use client";

import { useEffect, type ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Max width utility (default max-w-xl). */
  widthClass?: string;
}

// Generic centered admin dialog with a forest header. Open state is owned by
// the caller (a trigger button), so it's reusable for edit/confirm popups that
// keep people out of long inline forms. Closes on backdrop click and Escape.
export function Modal({ title, onClose, children, widthClass = "max-w-xl" }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-ink)]/45 p-4 backdrop-blur-sm sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`flex max-h-[88vh] w-full flex-col overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--shadow-lg)] ${widthClass}`}>
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--color-forest)] px-6 py-4 text-[var(--color-cream)]">
          <h2 className="font-[family-name:var(--font-display)] text-xl">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-cream)]/70 transition-colors hover:bg-white/10 hover:text-[var(--color-cream)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
      </div>
    </div>
  );
}
