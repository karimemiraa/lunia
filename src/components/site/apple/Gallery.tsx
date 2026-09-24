"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface GalleryProps {
  children: ReactNode;
  /** Accessible name for the scroll region. */
  label: string;
  prevLabel: string;
  nextLabel: string;
}

// Apple's horizontal gallery ("Get the highlights", "Get to know…"): a native
// scroll-snap track that starts aligned with the page container and bleeds to
// the viewport edge, with round previous/next buttons underneath. Swipe/trackpad
// scrolling is native; the buttons page by ~80% of the visible width and
// disable at either end. RTL-aware (browsers report negative scrollLeft there).
export function Gallery({ children, label, prevLabel, nextLabel }: GalleryProps) {
  const track = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft);
    setAtStart(pos <= 4);
    setAtEnd(pos >= max - 4);
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  const page = (forward: boolean) => {
    const el = track.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    const step = el.clientWidth * 0.8 * (forward ? 1 : -1) * (rtl ? -1 : 1);
    el.scrollBy({ left: step, behavior: "smooth" });
  };

  const btn =
    "flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-ink)]/[0.07] text-[var(--color-ink)] transition-colors hover:bg-[var(--color-ink)]/[0.13] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-[var(--color-ink)]/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)]";

  return (
    <div>
      <div
        ref={track}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="lx-gallery lx-snap flex gap-4 overflow-x-auto pb-2 focus-visible:outline-none sm:gap-5"
      >
        {children}
      </div>
      <div className="mx-auto mt-6 flex w-full max-w-7xl justify-end gap-3 px-5 sm:px-6">
        <button type="button" onClick={() => page(false)} disabled={atStart} aria-label={prevLabel} className={btn}>
          <svg viewBox="0 0 16 16" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m10 3-5 5 5 5" />
          </svg>
        </button>
        <button type="button" onClick={() => page(true)} disabled={atEnd} aria-label={nextLabel} className={btn}>
          <svg viewBox="0 0 16 16" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 3 5 5-5 5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
