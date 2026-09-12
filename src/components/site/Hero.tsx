import type { ReactNode } from "react";
import Link from "next/link";
import { MediaFrame } from "./MediaFrame";
import { Starfield } from "./Starfield";

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
  /** Optional secondary link shown beside the primary CTA. */
  secondaryLabel?: string;
  secondaryHref?: string;
  /** Optional floating card (e.g. a rating/trust badge) overlapping the hero's
   *  inline-end edge on larger screens — adds depth without new media. */
  floatingCard?: ReactNode;
}

const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-ink)]";

// On-brand atmospheric backdrop shipped with the build, used until a real hero
// photograph is uploaded through the CMS.
const FALLBACK_IMAGE = "/hero-lunia.svg";

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

// The full-bleed opener: a slowly-drifting brand image behind a legibility
// scrim and a celestial star layer, with an overlaid content column anchored
// to the block-end so the headline reads clearly while leaving generous
// negative space above (per the brand's photography direction). Alignment
// follows the block's writing direction, so it mirrors correctly under RTL.
// Entrance motion is staggered CSS (reduced-motion aware) — no client JS here.
export function Hero({
  eyebrow,
  headline,
  subhead,
  ctaLabel,
  ctaHref,
  media,
  secondaryLabel,
  secondaryHref,
  floatingCard,
}: HeroProps) {
  return (
    <section className="relative isolate overflow-hidden bg-[var(--color-ink)]">
      {/* Background */}
      <div className="absolute inset-0">
        {media?.key ? (
          <MediaFrame
            mediaKey={media.key}
            kind={media.kind}
            alt=""
            aspectClassName="h-full"
            rounded={false}
            className="h-full w-full"
          />
        ) : (
          <div className="h-full w-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element -- static, pre-optimized brand SVG backdrop */}
            <img
              src={FALLBACK_IMAGE}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover [animation:lunia-ken-burns_24s_ease-in-out_infinite_alternate]"
            />
          </div>
        )}
        {/* Legibility scrims — stronger toward the block-end where text sits. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[var(--color-ink)] via-[var(--color-ink)]/45 to-[var(--color-ink)]/5"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(120%_90%_at_15%_100%,color-mix(in_srgb,var(--color-ink)_60%,transparent),transparent_60%)]"
        />
        <Starfield tone="cream" className="opacity-70" />
      </div>

      {/* Content */}
      <div className="relative mx-auto flex min-h-[38rem] w-full max-w-6xl flex-col justify-end gap-8 px-6 py-24 sm:min-h-[46rem] sm:py-32">
        <div className="flex max-w-2xl flex-col gap-6 text-start">
          {eyebrow && (
            <span className="lunia-animate-fade-up lunia-delay-1 inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.4em] text-[var(--color-teal)]">
              <GlowMark className="lunia-glow-pulse h-3.5 w-3.5 shrink-0" />
              {eyebrow}
            </span>
          )}
          <h1 className="lunia-animate-fade-up lunia-delay-2 font-[family-name:var(--font-display)] text-5xl font-medium leading-[1.05] tracking-tight text-[var(--color-cream)] sm:text-7xl">
            {headline}
          </h1>
          {subhead && (
            <p className="lunia-animate-fade-up lunia-delay-3 max-w-xl text-base leading-relaxed text-[var(--color-cream)]/85 sm:text-lg">
              {subhead}
            </p>
          )}
          <div className="lunia-animate-fade-up lunia-delay-4 mt-2 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link href={ctaHref} className={`lunia-btn lunia-btn-primary px-8 py-3.5 ${focusRingClass}`}>
              {ctaLabel}
            </Link>
            {secondaryLabel && secondaryHref && (
              <Link
                href={secondaryHref}
                className={`lunia-underline text-sm font-medium tracking-wide text-[var(--color-cream)] ${focusRingClass}`}
              >
                {secondaryLabel}
              </Link>
            )}
          </div>
        </div>

        {floatingCard && (
          <div className="lunia-animate-fade-up lunia-delay-5 pointer-events-none absolute bottom-12 hidden lg:block" style={{ insetInlineEnd: "1.5rem" }}>
            {floatingCard}
          </div>
        )}
      </div>

      {/* Quiet scroll cue */}
      <div
        aria-hidden="true"
        className="lunia-float absolute bottom-6 left-1/2 hidden -translate-x-1/2 sm:block"
      >
        <span className="block h-10 w-[1px] bg-gradient-to-b from-transparent via-[var(--color-cream)]/60 to-transparent" />
      </div>
    </section>
  );
}
