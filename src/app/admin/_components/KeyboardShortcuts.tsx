"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { openPalette } from "./CommandPalette";

interface KeyboardShortcutsProps {
  /** Hrefs the viewer may open (permission + hidden-menu filtered). */
  allowedHrefs: string[];
  canBook: boolean;
}

interface Shortcut {
  keys: string[];
  label: string;
  href?: string;
  run?: () => void;
  enabled: boolean;
}

const SEQUENCE_MS = 900;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Global staff shortcuts (Gmail-style two-key sequences):
 *   g d dashboard · g c calendar · g k customers · g b billing · g i inventory
 *   n b new booking · / search · ? this sheet · Esc closes the sheet
 * Ignored while typing in a field or when a modifier is held.
 */
export function KeyboardShortcuts({ allowedHrefs, canBook }: KeyboardShortcutsProps) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const pending = useRef<{ key: string; at: number } | null>(null);
  const allowed = new Set(allowedHrefs);

  const shortcuts: Shortcut[] = [
    { keys: ["g", "d"], label: "Go to dashboard", href: "/admin", enabled: true },
    { keys: ["g", "c"], label: "Go to calendar", href: "/admin/calendar", enabled: allowed.has("/admin/calendar") },
    { keys: ["g", "k"], label: "Go to customers", href: "/admin/clients", enabled: allowed.has("/admin/clients") },
    { keys: ["g", "b"], label: "Go to invoices & payments", href: "/admin/billing", enabled: allowed.has("/admin/billing") },
    { keys: ["g", "i"], label: "Go to products & stock", href: "/admin/inventory", enabled: allowed.has("/admin/inventory") },
    { keys: ["g", "n"], label: "Go to notifications", href: "/admin/notifications", enabled: true },
    { keys: ["n", "b"], label: "New booking (walk-in)", href: "/admin/calendar?add=1", enabled: canBook },
    { keys: ["n", "i"], label: "New walk-in invoice", href: "/admin/billing/new", enabled: allowed.has("/admin/billing") },
    { keys: ["/"], label: "Search or jump to…", run: openPalette, enabled: true },
    { keys: ["?"], label: "Show keyboard shortcuts", run: () => setSheetOpen((o) => !o), enabled: true },
  ];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        if (sheetOpen) setSheetOpen(false);
        return;
      }
      if (isTypingTarget(e.target)) return;
      // Another dialog (palette/confirm) is open: leave keys to it.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;

      const key = e.key;
      const now = Date.now();
      const first = pending.current && now - pending.current.at < SEQUENCE_MS ? pending.current.key : null;

      if (first) {
        pending.current = null;
        const match = shortcuts.find((s) => s.enabled && s.keys.length === 2 && s.keys[0] === first && s.keys[1] === key.toLowerCase());
        if (match) {
          e.preventDefault();
          if (match.href) router.push(match.href);
          else match.run?.();
          return;
        }
      }
      const single = shortcuts.find((s) => s.enabled && s.keys.length === 1 && s.keys[0] === key);
      if (single) {
        e.preventDefault();
        if (single.href) router.push(single.href);
        else single.run?.();
        return;
      }
      if (key.toLowerCase() === "g" || key.toLowerCase() === "n") {
        pending.current = { key: key.toLowerCase(), at: now };
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // shortcuts is rebuilt each render from stable props; router is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOpen, allowedHrefs.join("|"), canBook]);

  if (!sheetOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--color-ink)]/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setSheetOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lunia-shortcuts-title"
        className="lunia-pop-in w-full max-w-lg rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="lunia-shortcuts-title" className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">
              Keyboard shortcuts
            </h2>
            <p className="mt-1 text-sm text-[var(--color-ink)]/60">Press the keys in sequence, outside a text field.</p>
          </div>
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            aria-label="Close"
            autoFocus
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--color-ink)]/60 transition-colors hover:bg-[var(--color-ink)]/[0.06] focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <dl className="mt-5 grid gap-y-2.5 sm:grid-cols-[auto_1fr] sm:gap-x-6">
          <dt className="flex items-center gap-1"><kbd className="lunia-kbd">⌘</kbd><span className="text-xs text-[var(--color-ink)]/40">/</span><kbd className="lunia-kbd">Ctrl</kbd><kbd className="lunia-kbd">K</kbd></dt>
          <dd className="text-sm text-[var(--color-ink)]/80">Search or jump to anything</dd>
          {shortcuts
            .filter((s) => s.enabled)
            .map((s) => (
              <FragmentRow key={s.label} keys={s.keys} label={s.label} />
            ))}
          <dt className="flex items-center gap-1"><kbd className="lunia-kbd">Esc</kbd></dt>
          <dd className="text-sm text-[var(--color-ink)]/80">Close dialogs</dd>
        </dl>
      </div>
    </div>,
    document.body,
  );
}

function FragmentRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <>
      <dt className="flex items-center gap-1">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-xs text-[var(--color-ink)]/40">then</span>}
            <kbd className="lunia-kbd">{k}</kbd>
          </span>
        ))}
      </dt>
      <dd className="text-sm text-[var(--color-ink)]/80">{label}</dd>
    </>
  );
}
