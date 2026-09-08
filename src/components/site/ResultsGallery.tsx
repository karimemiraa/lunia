"use client";

import { useMemo, useState } from "react";
import { MediaFrame } from "./MediaFrame";

interface ResultsGalleryMedia {
  key: string;
  kind?: "IMAGE" | "VIDEO";
}

interface ResultsGalleryItem {
  media?: ResultsGalleryMedia | null;
  category?: string;
  caption?: string;
}

interface ResultsGalleryProps {
  items: ResultsGalleryItem[];
  /** Category values to filter by; omit or leave empty to skip the filter row entirely. */
  categories?: string[];
  /** Localized label for the "show everything" chip; omit to hide that chip. */
  allLabel?: string;
  /** Localized consent/placeholder note shown under the grid; omit to hide it. */
  consentNote?: string;
  /** Localized empty-state copy; omit to render nothing when `items` is empty. */
  emptyLabel?: string;
}

const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)]";

function chipClass(isActive: boolean) {
  return `rounded-full border px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition-colors duration-300 ${focusRingClass} ${
    isActive
      ? "border-[var(--color-teal)] bg-[var(--color-teal)] text-[var(--color-ink)]"
      : "border-[var(--color-ink)]/15 text-[var(--color-ink)]/60 hover:border-[var(--color-ink)]/35 hover:text-[var(--color-ink)]"
  }`;
}

// A tasteful, category-filterable results grid. It's a client component
// only because the filter is interactive — the grid itself is a simple
// CSS-columns masonry (no library) so items of different aspect ratios sit
// together without gaps. Renders gracefully with no items (nothing, or the
// caller's own empty copy) since before real before/after media is
// uploaded this section shouldn't look broken.
export function ResultsGallery({ items, categories, allLabel, consentNote, emptyLabel }: ResultsGalleryProps) {
  const [active, setActive] = useState<string | null>(null);

  const visible = useMemo(
    () => (active ? items.filter((item) => item.category === active) : items),
    [items, active],
  );

  if (items.length === 0) {
    return emptyLabel ? <p className="text-center text-sm text-[var(--color-ink)]/60">{emptyLabel}</p> : null;
  }

  return (
    <div className="flex flex-col gap-10">
      {categories && categories.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {allLabel && (
            <button type="button" onClick={() => setActive(null)} className={chipClass(active === null)}>
              {allLabel}
            </button>
          )}
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActive(category)}
              className={chipClass(active === category)}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      <div className="columns-1 gap-6 sm:columns-2 lg:columns-3 [&>figure]:mb-6 [&>figure]:break-inside-avoid">
        {visible.map((item, index) => (
          <figure key={index} className="flex flex-col gap-3">
            <MediaFrame mediaKey={item.media?.key} kind={item.media?.kind} alt={item.caption ?? ""} aspectClassName="aspect-[3/4]" />
            {item.caption && <figcaption className="text-sm text-[var(--color-ink)]/70">{item.caption}</figcaption>}
          </figure>
        ))}
      </div>

      {consentNote && <p className="text-center text-xs text-[var(--color-ink)]/50">{consentNote}</p>}
    </div>
  );
}
