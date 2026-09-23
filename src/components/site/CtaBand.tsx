import Link from "next/link";

interface CtaBandProps {
  eyebrow?: string;
  headline: string;
  ctaLabel: string;
  ctaHref: string;
}

const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-teal)]";

// The recurring "Start your journey" booking band that closes most public
// pages: a warm teal field, a serif headline, and a single ink-colored CTA
// — no imagery, no clutter, just an unmissable, elegant call to book.
export function CtaBand({ eyebrow, headline, ctaLabel, ctaHref }: CtaBandProps) {
  return (
    <div className="lunia-pattern-mosaic lunia-pattern-multiply overflow-hidden rounded-[2rem] bg-[var(--color-teal)] px-8 py-16 text-center sm:px-16 sm:py-20">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6">
        {eyebrow && (
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-ink)]/70">
            <span aria-hidden="true" className="lunia-glow-mark" />
            {eyebrow}
            <span aria-hidden="true" className="lunia-glow-mark" />
          </span>
        )}
        <h2 data-splittext className="font-[family-name:var(--font-display)] text-3xl leading-tight tracking-tight text-[var(--color-ink)] sm:text-5xl">
          {headline}
        </h2>
        <Link
          href={ctaHref}
          data-magnetic
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-full bg-[var(--color-ink)] px-8 py-3.5 text-sm font-medium tracking-wide text-[var(--color-cream)] transition-colors hover:bg-[var(--color-ink)]/85 ${focusRingClass}`}
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
