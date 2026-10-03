"use client";

import { useState, useTransition } from "react";
import type { EditionKey } from "@/modules/cms/settings";
import { setEditionAction } from "./actions";

interface EditionOption {
  key: EditionKey;
  name: string;
  tagline: string;
  preview: string;
  recommended?: boolean;
}

const EDITIONS: EditionOption[] = [
  { key: "classic", name: "Classic", tagline: "The original cinematic site with the signature header. What you have today.", preview: "/" },
  { key: "cinematic", name: "Cinematic", tagline: "The cinematic video hero + the Serene floating glass nav. Premium and emotional.", preview: "/v3", recommended: true },
  { key: "soft", name: "Serene (Soft-UI)", tagline: "A calm, booking-first layout — the clearest path to a booking.", preview: "/v2" },
  { key: "motion", name: "Motion", tagline: "Flagship scroll: kinetic hero + a pinned horizontal journey. Maximum wow.", preview: "/v4" },
];

// One-click homepage design switch. Changes the live homepage's layout AND its
// chrome (header/footer). Works with any colour theme above.
export function EditionPicker({ current }: { current: EditionKey }) {
  const [active, setActive] = useState<EditionKey>(current);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(key: EditionKey) {
    if (key === active || pending) return;
    const previous = active;
    setActive(key);
    setMsg(null);
    startTransition(async () => {
      const r = await setEditionAction(key);
      if (r.error) {
        setActive(previous);
        setMsg(r.error);
      } else {
        setMsg(`Homepage now uses the ${EDITIONS.find((e) => e.key === key)?.name} design.`);
      }
    });
  }

  return (
    <section className="lunia-card p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">Homepage design</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink)]/60">
            Switch the whole homepage experience — layout, animations and the header/footer. Combines with any colour theme above.
            Recommended: <span className="font-medium text-[var(--color-teal-ink)]">Cinematic</span>.
          </p>
        </div>
      </div>

      <div role="radiogroup" aria-label="Homepage design" className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {EDITIONS.map((e) => {
          const selected = e.key === active;
          return (
            <div key={e.key} className={`flex flex-col rounded-[var(--radius)] border transition-all ${selected ? "border-[var(--color-teal-ink)] shadow-[var(--shadow-glow)]" : "border-[var(--line)]"}`}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={pending}
                onClick={() => choose(e.key)}
                className="flex flex-1 flex-col items-start p-5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2"
              >
                <span className="flex w-full items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--color-ink)]">{e.name}</span>
                  <span className="flex items-center gap-2">
                    {e.recommended && <span className="rounded-full bg-[var(--color-teal)]/25 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-[var(--color-teal-ink)]">Pick</span>}
                    {e.key === current && <span className="text-[0.6rem] font-medium uppercase tracking-wider text-[var(--color-teal-ink)]">Live</span>}
                    <span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded-full border ${selected ? "border-[var(--color-teal-ink)] bg-[var(--color-teal-ink)]" : "border-[var(--line-strong)]"}`}>
                      {selected && <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.4"><path strokeLinecap="round" strokeLinejoin="round" d="m3.5 8.5 3 3 6-6" /></svg>}
                    </span>
                  </span>
                </span>
                <span className="mt-2 text-xs leading-relaxed text-[var(--color-ink)]/60">{e.tagline}</span>
              </button>
              <a href={e.preview} target="_blank" rel="noreferrer" className="border-t border-[var(--line)] px-5 py-2.5 text-xs font-medium text-[var(--color-teal-ink)] hover:underline">
                Preview →
              </a>
            </div>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-3 min-h-[1.25rem] text-xs text-[var(--color-ink)]/60">{pending ? "Applying…" : msg}</p>
    </section>
  );
}
