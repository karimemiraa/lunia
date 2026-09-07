import Link from "next/link";
import { MediaFrame } from "./MediaFrame";

interface HeroMedia {
  key: string;
  kind?: "IMAGE" | "VIDEO";
}

interface HeroProps {
  eyebrow?: string;
  headline: string;
  subhead?: string;
  ctaLabel: string;
  ctaHref: string;
  media?: HeroMedia | null;
}

const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbfaf7]";

const ctaClass = `inline-flex w-fit items-center justify-center whitespace-nowrap rounded-full bg-[var(--color-teal)] px-8 py-3.5 text-sm font-medium tracking-wide text-[var(--color-ink)] transition-colors hover:bg-[var(--color-canopy)] ${focusRingClass}`;

// The brand's quiet moon/star "glow" mark, reused here as the eyebrow accent.
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

// The full-bleed opener used at the top of Home (and reusable for other
// landing moments): a MediaFrame background with a legibility scrim and an
// overlaid content column anchored to the block-end, so the headline reads
// clearly over any photo or footage while leaving generous negative space
// above it. Alignment follows the block's own writing direction (text-start)
// rather than a hardcoded side, so it mirrors correctly under RTL with no
// locale branching here — the page passes already-localized strings.
export function Hero({ eyebrow, headline, subhead, ctaLabel, ctaHref, media }: HeroProps) {
  return (
    <section className="relative isolate overflow-hidden bg-[var(--color-ink)]">
      <div className="absolute inset-0">
        <MediaFrame
          mediaKey={media?.key}
          kind={media?.kind}
          alt=""
          aspectClassName="h-full"
          rounded={false}
          className="h-full w-full"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[var(--color-ink)] via-[var(--color-ink)]/35 to-[var(--color-ink)]/10"
        />
      </div>

      <div className="relative mx-auto flex min-h-[34rem] w-full max-w-6xl flex-col justify-end gap-8 px-6 py-24 sm:min-h-[42rem] sm:py-32">
        <div className="flex max-w-2xl flex-col gap-6 text-start">
          {eyebrow && (
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.35em] text-[var(--color-teal)]">
              <GlowMark className="h-3 w-3 shrink-0" />
              {eyebrow}
            </span>
          )}
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.08] tracking-tight text-[var(--color-cream)] sm:text-6xl">
            {headline}
          </h1>
          {subhead && (
            <p className="max-w-xl text-base leading-relaxed text-[var(--color-cream)]/85 sm:text-lg">{subhead}</p>
          )}
          <Link href={ctaHref} className={ctaClass}>
            {ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
