"use client";

import { useState, useTransition } from "react";
import type { ThemeKey } from "@/modules/cms/settings";
import { setThemeAction } from "./actions";

interface ThemeOption {
  key: ThemeKey;
  name: string;
  tagline: string;
  /** Miniature of the theme's ground / surfaces / accent, for the preview card. */
  swatch: { page: string; surface: string; accent: string; text: string; glow?: string };
}


const THEMES: ThemeOption[] = [
  {
    key: "luminous",
    name: "Luminous",
    tagline: "Pale mint ground, teal fields, ink serif. Light and airy — the signature look.",
    swatch: { page: "#f1f7f5", surface: "#ffffff", accent: "#9ed5d0", text: "#223f3a" },
  },
  {
    key: "midnight",
    name: "Midnight",
    tagline: "Deep teal-ink ground, the teal glowing against it, cream type. Evening luxury.",
    swatch: { page: "#0e1d1a", surface: "#15302b", accent: "#9ed5d0", text: "#eef5f3", glow: "radial-gradient(70% 70% at 75% 25%, rgba(158,213,208,0.5), transparent 70%)" },
  },
  {
    key: "aurora",
    name: "Aurora",
    tagline: "Liquid glass: frosted cards floating over a living teal, ice and rose aurora.",
    swatch: {
      page: "#eaf3f4",
      surface: "rgba(255,255,255,0.62)",
      accent: "#9ed5d0",
      text: "#223f3a",
      glow: "radial-gradient(40% 42% at 15% 20%, rgba(158,213,208,0.85), transparent 66%), radial-gradient(40% 40% at 85% 18%, rgba(207,234,231,0.95), transparent 66%), radial-gradient(46% 46% at 78% 85%, rgba(217,204,163,0.7), transparent 66%), radial-gradient(40% 40% at 22% 90%, rgba(134,191,184,0.7), transparent 66%)",
    },
  },
  {
    key: "dune",
    name: "Dune",
    tagline: "Warm ivory and sand, soft gold hairlines, deep teal accents. Calm, warm luxury.",
    swatch: { page: "#f4eee1", surface: "#fbf6ec", accent: "#c0ad73", text: "#33302a", glow: "radial-gradient(70% 70% at 80% 20%, rgba(192,173,115,0.28), transparent 70%)" },
  },
];

// One-click website theme switch. Each card is a live-ish miniature of the
// theme (ground, a card, the teal accent) so the choice is visual, not a
// dropdown of names. Saving writes the "appearance" setting; the public site
// reads it per request.
export function ThemePicker({ current }: { current: ThemeKey }) {
  const [active, setActive] = useState<ThemeKey>(current);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(key: ThemeKey) {
    if (key === active || pending) return;
    const previous = active;
    setActive(key);
    setMsg(null);
    startTransition(async () => {
      const r = await setThemeAction(key);
      if (r.error) {
        setActive(previous);
        setMsg(r.error);
      } else {
        setMsg(`Website now uses the ${THEMES.find((t) => t.key === key)?.name} theme.`);
      }
    });
  }

  return (
    <section className="lunia-card p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">Website theme</h2>
          <p className="mt-1 text-sm text-[var(--color-ink)]/60">
            Switch the public website's look with one click. Content, logo and the brand teal stay the same.
          </p>
        </div>
        <a href="/ar" target="_blank" rel="noreferrer" className="lunia-btn lunia-btn-ghost lunia-btn-sm">
          Open website
        </a>
      </div>

      <div role="radiogroup" aria-label="Website theme" className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {THEMES.map((t) => {
          const selected = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={pending}
              onClick={() => choose(t.key)}
              className={`group flex flex-col overflow-hidden rounded-[var(--radius)] border text-start transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 ${
                selected
                  ? "border-[var(--color-teal-ink)] shadow-[var(--shadow-glow)]"
                  : "border-[var(--line)] hover:border-[var(--color-teal)] hover:shadow-[var(--shadow-md)]"
              }`}
            >
              {/* Miniature */}
              <div
                aria-hidden="true"
                className="relative h-32 w-full overflow-hidden"
                style={{
                  background: t.swatch.glow ? `${t.swatch.glow}, ${t.swatch.page}` : t.swatch.page,
                }}
              >
                <div className="absolute inset-x-0 top-0 flex h-6 items-center gap-1.5 px-3" style={{ background: t.swatch.surface }}>
                  <span className="h-2.5 w-10 rounded-full" style={{ background: t.swatch.text, opacity: 0.85 }} />
                  <span className="ms-auto h-2 w-6 rounded-full" style={{ background: t.swatch.accent }} />
                </div>
                <div className="absolute left-3 top-9 h-3 w-24 rounded-full" style={{ background: t.swatch.text, opacity: 0.8 }} />
                <div className="absolute left-3 top-14 h-2 w-16 rounded-full" style={{ background: t.swatch.text, opacity: 0.35 }} />
                <div className="absolute bottom-3 left-3 right-3 flex gap-2">
                  <div
                    className="h-10 flex-1 rounded-lg"
                    style={{ background: t.swatch.surface, boxShadow: t.key === "aurora" ? "inset 0 1px 0 rgba(255,255,255,.9), 0 6px 16px -8px rgba(34,63,58,.35)" : "0 6px 16px -10px rgba(0,0,0,.4)" }}
                  />
                  <div className="h-10 w-14 rounded-lg" style={{ background: t.swatch.accent }} />
                </div>
              </div>
              <div className="flex items-start gap-3 p-4">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    selected ? "border-[var(--color-teal-ink)] bg-[var(--color-teal-ink)]" : "border-[var(--line-strong)]"
                  }`}
                >
                  {selected && (
                    <svg viewBox="0 0 16 16" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m3.5 8.5 3 3 6-6" />
                    </svg>
                  )}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-[var(--color-ink)]">
                    {t.name}
                    {t.key === current && <span className="ms-2 text-[0.65rem] font-medium uppercase tracking-wider text-[var(--color-teal-ink)]">Live</span>}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-ink)]/60">{t.tagline}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-3 min-h-[1.25rem] text-xs text-[var(--color-ink)]/60">
        {pending ? "Applying…" : msg}
      </p>
    </section>
  );
}
