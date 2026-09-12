interface HeroRatingCardProps {
  /** Average rating on a 0–5 scale. */
  avg: number;
  /** Number of reviews the average is drawn from. */
  count: number;
  /** Localized summary, e.g. "from {count} client reviews" ({count} interpolated by the caller). */
  summary: string;
}

function Stars({ avg }: { avg: number }) {
  // Five stars with a proportional gold fill for the fractional last star.
  const pct = Math.max(0, Math.min(100, (avg / 5) * 100));
  return (
    <div className="relative inline-flex" aria-hidden="true">
      <div className="flex text-[var(--color-ink)]/15">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} />
        ))}
      </div>
      <div className="absolute inset-0 flex overflow-hidden text-[var(--color-gold)]" style={{ width: `${pct}%` }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} />
        ))}
      </div>
    </div>
  );
}

function Star() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 fill-current">
      <path d="M10 1.5l2.47 5.16 5.68.66-4.2 3.86 1.12 5.61L10 14.9l-5.07 2.4 1.12-5.61-4.2-3.86 5.68-.66L10 1.5z" />
    </svg>
  );
}

// A compact "glass" trust card for the hero's inline-end corner: the real
// aggregate rating (never shown when there are no reviews — the caller gates
// on count) rendered as a number + proportional stars + a review count. Adds
// social proof and Clingr-style depth to the opener without any new media.
export function HeroRatingCard({ avg, count, summary }: HeroRatingCardProps) {
  return (
    <div className="pointer-events-auto flex items-center gap-4 rounded-2xl border border-[var(--color-cream)]/25 bg-[var(--color-cream)]/95 px-5 py-4 shadow-[var(--shadow-lg)] backdrop-blur-md">
      <span className="font-[family-name:var(--font-display)] text-4xl font-medium leading-none text-[var(--color-ink)]">
        {avg.toFixed(1)}
      </span>
      <span className="block h-10 w-px bg-[var(--color-ink)]/10" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <Stars avg={avg} />
        <span className="text-xs text-[var(--color-ink)]/60">{summary}</span>
      </div>
    </div>
  );
}
