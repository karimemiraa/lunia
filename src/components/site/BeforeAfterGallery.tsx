"use client";

import { useMemo, useState } from "react";

export interface BeforeAfterItem {
  id: string;
  category: string;
  caption: string;
}

interface BeforeAfterGalleryProps {
  items: BeforeAfterItem[];
  categories: string[];
  allLabel: string;
  beforeLabel: string;
  afterLabel: string;
  compareLabel: string;
  consentNote?: string;
}

/* eslint-disable @next/next/no-img-element -- consent-gated API route; next/image would cache it in the optimizer */

// One pair: the After photo with the Before overlaid and a draggable divider.
function Pair({ item, beforeLabel, afterLabel, compareLabel }: { item: BeforeAfterItem; beforeLabel: string; afterLabel: string; compareLabel: string }) {
  const [pos, setPos] = useState(50);
  return (
    <figure className="flex flex-col gap-3" data-testid="before-after-pair">
      <div className="relative aspect-[4/5] select-none overflow-hidden rounded-[28px] bg-[var(--color-ice)]" dir="ltr">
        <img src={`/api/results/${item.id}/after`} alt={`${afterLabel}: ${item.caption}`} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        <img
          src={`/api/results/${item.id}/before`}
          alt={`${beforeLabel}: ${item.caption}`}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          draggable={false}
        />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-[var(--color-page)] shadow" style={{ left: `${pos}%` }} />
        <span className="absolute left-3 top-3 rounded-full bg-[var(--color-ink)]/70 px-3 py-1 text-xs font-medium text-[var(--color-on-ink)]">{beforeLabel}</span>
        <span className="absolute right-3 top-3 rounded-full bg-[var(--color-ink)]/70 px-3 py-1 text-xs font-medium text-[var(--color-on-ink)]">{afterLabel}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label={compareLabel}
          className="absolute inset-x-4 bottom-3 h-8 accent-[var(--color-page)]"
        />
      </div>
      {item.caption && <figcaption className="text-sm text-[var(--color-ink)]/75">{item.caption}</figcaption>}
    </figure>
  );
}

// Published, consented before/after pairs with a category filter.
export function BeforeAfterGallery({ items, categories, allLabel, beforeLabel, afterLabel, compareLabel, consentNote }: BeforeAfterGalleryProps) {
  const [active, setActive] = useState<string | null>(null);
  const visible = useMemo(() => (active ? items.filter((i) => i.category === active) : items), [items, active]);
  const used = categories.filter((c) => items.some((i) => i.category === c));
  const chip = (on: boolean) =>
    `rounded-full border px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition-colors duration-300 ${
      on ? "border-[var(--color-teal)] bg-[var(--color-teal)] text-[var(--color-on-teal)]" : "border-[var(--color-ink)]/15 text-[var(--color-ink)]/75 hover:border-[var(--color-ink)]/35"
    }`;
  return (
    <div className="flex flex-col gap-10" data-testid="before-after-gallery">
      {used.length > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={() => setActive(null)} className={chip(active === null)}>
            {allLabel}
          </button>
          {used.map((c) => (
            <button key={c} type="button" onClick={() => setActive(c)} className={chip(active === c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((item) => (
          <Pair key={item.id} item={item} beforeLabel={beforeLabel} afterLabel={afterLabel} compareLabel={compareLabel} />
        ))}
      </div>
      {consentNote && <p className="text-center text-xs text-[var(--color-ink)]/60">{consentNote}</p>}
    </div>
  );
}
