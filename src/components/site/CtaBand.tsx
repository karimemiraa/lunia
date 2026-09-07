import Link from "next/link";

interface CtaBandProps {
  eyebrow?: string;
  headline: string;
  ctaLabel: string;
  ctaHref: string;
}

const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-teal)]";

// The brand's quiet moon/star "glow" mark, used here as the eyebrow accent.
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

// The recurring "Start your journey" booking band that closes most public
// pages: a warm teal field, a serif headline, and a single ink-colored CTA
// — no imagery, no clutter, just an unmissable, elegant call to book.
export function CtaBand({ eyebrow, headline, ctaLabel, ctaHref }: CtaBandProps) {
  return (
    <div className="rounded-[2rem] bg-[var(--color-teal)] px-8 py-16 text-center sm:px-16 sm:py-20">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6">
        {eyebrow && (
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-ink)]/70">
            <GlowMark className="h-3 w-3 shrink-0 text-[var(--color-ink)]/70" />
            {eyebrow}
          </span>
        )}
        <h2 className="font-[family-name:var(--font-display)] text-3xl leading-tight tracking-tight text-[var(--color-ink)] sm:text-5xl">
          {headline}
        </h2>
        <Link
          href={ctaHref}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-full bg-[var(--color-ink)] px-8 py-3.5 text-sm font-medium tracking-wide text-[var(--color-cream)] transition-colors hover:bg-[var(--color-ink)]/85 ${focusRingClass}`}
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
