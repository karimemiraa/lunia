"use client";

import { useEffect, useRef, useState } from "react";
import { JourneySteps } from "./JourneySteps";

interface JourneyStep {
  title: string;
  body?: string;
}

interface ScrollJourneyProps {
  eyebrow?: string;
  heading?: string;
  steps: JourneyStep[];
}

function GlowMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <path
        fill="currentColor"
        d="M12 0c.6 4.8 2.6 8.2 6 9.6L24 12l-6 2.4c-3.4 1.4-5.4 4.8-6 9.6-.6-4.8-2.6-8.2-6-9.6L0 12l6-2.4C9.4 8.2 11.4 4.8 12 0Z"
      />
    </svg>
  );
}

// A pinned, scroll-scrubbed telling of the client journey: the section is tall,
// its inner panel pins to the viewport, and the active step advances as you
// scroll through it — an oversized ordinal cross-fades, the copy swaps, and a
// rail tracks progress. Motion is driven by the real scroll position (rAF-
// throttled), so it feels linked to the scroll rather than firing once.
//
// Progressive enhancement: it renders the accessible static <JourneySteps>
// sequence on the server and for reduced-motion / no-JS visitors, and upgrades
// to the pinned experience only after mount when motion is welcome. Uses
// logical properties so it mirrors under RTL.
export function ScrollJourney({ eyebrow, heading, steps }: ScrollJourneyProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [enhanced, setEnhanced] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setEnhanced(true);

    let raf = 0;
    const update = () => {
      raf = 0;
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const scrolled = Math.min(Math.max(-rect.top, 0), total);
      setProgress(total > 0 ? scrolled / total : 0);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const n = steps.length;

  // Static, fully-accessible fallback (server render, no-JS, reduced-motion).
  if (!enhanced) {
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32">
        <JourneySteps eyebrow={eyebrow} heading={heading} steps={steps} />
      </section>
    );
  }

  // Map overall progress to an active step, biased so each step holds the
  // spotlight for roughly an equal share of the scroll.
  const active = Math.min(n - 1, Math.max(0, Math.floor(progress * n * 0.999)));

  return (
    <section ref={sectionRef} style={{ height: `${n * 72}vh` }} className="relative">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-16">
          {/* Heading + progress rail + markers */}
          <div className="flex flex-col gap-6 text-start">
            {eyebrow && (
              <span className="inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.4em] text-[var(--color-teal-ink)]">
                <GlowMark className="h-3.5 w-3.5 shrink-0 text-[var(--color-gold)]" />
                {eyebrow}
              </span>
            )}
            {heading && (
              <h2 className="font-[family-name:var(--font-display)] text-4xl leading-[1.1] tracking-tight text-[var(--color-ink)] sm:text-5xl">
                {heading}
              </h2>
            )}
            <ol className="mt-2 flex flex-col gap-1">
              {steps.map((step, i) => {
                const isActive = i === active;
                return (
                  <li key={step.title} className="flex items-center gap-3">
                    <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
                      <span
                        className={`h-1.5 w-1.5 rounded-full transition-all duration-500 ${
                          isActive ? "scale-150 bg-[var(--color-gold)]" : "bg-[var(--color-ink)]/25"
                        }`}
                      />
                    </span>
                    <span
                      className={`text-sm transition-all duration-500 ${
                        isActive
                          ? "font-medium text-[var(--color-ink)]"
                          : "text-[var(--color-ink)]/40"
                      }`}
                    >
                      {step.title}
                    </span>
                  </li>
                );
              })}
            </ol>
            {/* Progress rail */}
            <div className="mt-2 h-px w-full overflow-hidden bg-[var(--color-ink)]/10">
              <div
                className="h-full bg-[var(--color-gold)] transition-[width] duration-150 ease-out"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>

          {/* Active step: oversized ordinal + copy, cross-fading on change */}
          <div className="relative min-h-[16rem]">
            <span
              key={`num-${active}`}
              aria-hidden="true"
              className="pointer-events-none block font-[family-name:var(--font-display)] text-[9rem] font-medium leading-none text-[var(--color-ink)]/10 [animation:lunia-fade-in_0.4s_ease-out] sm:text-[12rem]"
            >
              {String(active + 1).padStart(2, "0")}
            </span>
            <div key={`copy-${active}`} className="-mt-6 flex flex-col gap-3 [animation:lunia-fade-in_0.4s_ease-out]">
              <h3 className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-ink)] sm:text-4xl">
                {steps[active]?.title}
              </h3>
              {steps[active]?.body && (
                <p className="max-w-md text-base leading-relaxed text-[var(--color-ink)]/70">{steps[active]?.body}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
