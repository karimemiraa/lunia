"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { TOAST_EVENT, FLASH_COOKIE, decodeFlash, type ToastInput, type ToastTone } from "./toast";

interface ToastRecord extends ToastInput {
  id: number;
  tone: ToastTone;
}

const DEFAULT_MS = 4000;

const TONE_STYLE: Record<ToastTone, string> = {
  success: "border-[var(--status-success)]/30 text-[var(--status-success)]",
  error: "border-[var(--status-danger)]/30 text-[var(--status-danger)]",
  warning: "border-[var(--status-warning)]/30 text-[var(--status-warning)]",
  info: "border-[var(--status-info)]/30 text-[var(--status-info)]",
};

const TONE_ICON: Record<ToastTone, string> = {
  success: "m5 12.5 4.5 4.5L19 7",
  error: "M12 8v5M12 16.5v.5M12 3l9.5 17h-19L12 3Z",
  warning: "M12 8v5M12 16.5v.5M12 3l9.5 17h-19L12 3Z",
  info: "M12 11v6M12 7.5v.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
};

function readFlashCookie(): string | null {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${FLASH_COOKIE}=`));
  if (!match) return null;
  document.cookie = `${FLASH_COOKIE}=; path=/admin; max-age=0; samesite=lax`;
  return match.slice(FLASH_COOKIE.length + 1);
}

// Global toast outlet. Mounted once in AdminShell. Shows toasts from:
// - toast() events fired by client components,
// - `?toast=` in the URL (stripped from the address bar without a reload),
// - the `lunia_flash` cookie set by server actions (see flash.ts).
export function Toaster() {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, number>());
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = ++seq.current;
      const record: ToastRecord = { ...input, id, tone: input.tone ?? "success" };
      setToasts((list) => [...list.slice(-3), record]);
      const ms = input.duration ?? DEFAULT_MS;
      timers.current.set(id, window.setTimeout(() => dismiss(id), ms));
    },
    [dismiss],
  );

  useEffect(() => {
    const onToast = (e: Event) => push((e as CustomEvent<ToastInput>).detail);
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, [push]);

  // Server -> client: cookie flash, then `?toast=` (which we strip).
  useEffect(() => {
    const fromCookie = readFlashCookie();
    const decodedCookie = fromCookie ? decodeFlash(fromCookie) : null;
    if (decodedCookie) push(decodedCookie);

    const raw = searchParams?.get("toast");
    if (raw) {
      const decoded = decodeFlash(raw);
      if (decoded) push(decoded);
      const next = new URLSearchParams(searchParams.toString());
      next.delete("toast");
      const qs = next.toString();
      window.history.replaceState(window.history.state, "", `${pathname}${qs ? `?${qs}` : ""}`);
    }
  }, [pathname, searchParams, push]);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => window.clearTimeout(t));
  }, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:end-6 sm:bottom-6 sm:items-end"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`lunia-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius)] border bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-lg)] ${TONE_STYLE[t.tone]}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
            <path d={TONE_ICON[t.tone]} />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--color-ink)]">{t.title}</p>
            {t.body && <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-ink)]/60">{t.body}</p>}
          </div>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
            className="-me-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-ink)]/50 transition-colors hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden="true">
              <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
