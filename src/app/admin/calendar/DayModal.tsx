"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

interface DayModalProps {
  /** Where the close button / backdrop / Escape navigates to (drops the day param). */
  closeHref: string;
  title: string;
  children: ReactNode;
}

// URL-driven day modal for the calendar: the page renders it (server-side) when
// a `day` param is present, so the appointment list + walk-in form inside it are
// plain server-rendered content and router.refresh() from their actions updates
// the modal in place. Backdrop click and Escape close it by navigating.
export function DayModal({ closeHref, title, children }: DayModalProps) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(closeHref);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [closeHref, router]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-ink)]/45 p-4 backdrop-blur-sm sm:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) router.push(closeHref);
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="my-auto w-full max-w-3xl overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--color-forest)] px-6 py-4 text-[var(--color-cream)]">
          <h2 className="font-[family-name:var(--font-display)] text-xl">{title}</h2>
          <Link
            href={closeHref}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-cream)]/70 transition-colors hover:bg-white/10 hover:text-[var(--color-cream)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </Link>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
