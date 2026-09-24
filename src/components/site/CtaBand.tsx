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
    <div className="lunia-pattern-mosaic lunia-pattern-multiply overflow-hidden rounded-[2rem] bg-[var(--color-teal)] px-6 py-20 text-center sm:rounded-[2.5rem] sm:px-16 sm:py-28 lg:py-32">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-7">
        {eyebrow && (
          <span className="lx-eyebrow text-[var(--color-ink)]/75">
            <span aria-hidden="true" className="lunia-glow-mark" />
            {eyebrow}
            <span aria-hidden="true" className="lunia-glow-mark" />
          </span>
        )}
        <h2 data-splittext className="lx-display lx-h2 text-[var(--color-ink)]">
          {headline}
        </h2>
        <Link
          href={ctaHref}
          data-magnetic
          className={`lx-pill lx-pill-ink mt-2 px-8 py-4 text-base ${focusRingClass}`}
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
