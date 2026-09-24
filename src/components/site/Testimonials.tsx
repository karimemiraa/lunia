"use client";

import { useEffect, useRef, useState } from "react";
import { SectionHeading } from "./SectionHeading";

interface TestimonialItem {
  quote: string;
  author?: string;
}

interface TestimonialsProps {
  eyebrow?: string;
  heading?: string;
  items: TestimonialItem[];
}

const INTERVAL_MS = 5500;

// Auto-advancing, horizontal testimonial carousel: one editorial pull-quote at
// a time, sliding to the next every few seconds (pauses on hover/focus, and
// stops entirely under reduced-motion). Dots + arrows for manual control.
export function Testimonials({ eyebrow, heading, items }: TestimonialsProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = items.length;
  const go = (i: number) => setIndex(((i % count) + count) % count);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (count <= 1 || paused) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    timer.current = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [count, paused]);

  if (count === 0) return null;

  return (
    <div className="flex flex-col gap-12">
      {heading && <SectionHeading eyebrow={eyebrow} heading={heading} align="center" className="mx-auto" />}

      <div
        className="relative mx-auto w-full max-w-4xl"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <div className="overflow-hidden">
          <div
            className="flex transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ transform: `translateX(${index * -100}%)` }}
          >
            {items.map((item, i) => (
              <figure key={i} className="flex w-full shrink-0 flex-col items-center gap-6 px-6 text-center" aria-hidden={i !== index}>
                <blockquote className="font-[family-name:var(--font-display)] text-[clamp(1.7rem,1.2rem+1.9vw,2.9rem)] italic leading-[1.2] text-[var(--color-ink)]">
                  {item.quote}
                </blockquote>
                {item.author && (
                  <figcaption className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-ink)]/50">
                    {item.author}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </div>

        {count > 1 && (
          <>
            <div className="mt-8 flex items-center justify-center gap-2">
              {items.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Show testimonial ${i + 1}`}
                  aria-current={i === index}
                  className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-[var(--color-teal-ink)]" : "w-2 bg-[var(--color-ink)]/20 hover:bg-[var(--color-ink)]/40"}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous testimonial"
              className="absolute top-1/3 -start-2 hidden h-9 w-9 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--color-ink)]/60 transition-colors hover:text-[var(--color-ink)] sm:flex"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 rtl:-scale-x-100"><path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" /></svg>
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next testimonial"
              className="absolute top-1/3 -end-2 hidden h-9 w-9 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--color-ink)]/60 transition-colors hover:text-[var(--color-ink)] sm:flex"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 rtl:-scale-x-100"><path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" /></svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
