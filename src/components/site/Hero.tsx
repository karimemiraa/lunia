import type { ReactNode } from "react";
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
  secondaryLabel?: string;
  secondaryHref?: string;
  /** Optional floating card (e.g. a rating/trust badge). */
  floatingCard?: ReactNode;
}

const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal-ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)]";

// Brand hero photograph (bright, teal, subject to the inline-end with open
// space toward the inline-start for the headline). Uploading a hero image via
// the CMS overrides this default.
const DEFAULT_HERO = "/brand/hero.jpg";

// A bright, airy opener that matches the brand photography: the hero image
// bleeds full-width with the subject held to the inline-end, a soft page-tone
// wash on the inline-start keeps the headline legible, and the copy sits in the
// brand ink on top — no dark scrim. Under RTL the image mirrors and the wash
// flips so the subject and text never collide. The image parallaxes gently as
// the hero scrolls away (scroll-driven, reduced-motion aware).
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
    <section className="relative isolate overflow-hidden bg-[var(--color-teal)]">
      {/* Background image (subject to inline-end), gently parallaxing */}
      <div className="lunia-parallax absolute inset-0">
        {media?.key ? (
          <MediaFrame mediaKey={media.key} kind={media.kind} alt="" aspectClassName="h-full" rounded={false} className="h-full w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- brand hero photo served statically from /public
          <img
            src={DEFAULT_HERO}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover object-[75%_center] rtl:-scale-x-100"
          />
        )}
      </div>

      {/* Legibility wash on the inline-start only (flips under RTL). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-[var(--color-page)] via-[var(--color-page)]/70 to-transparent rtl:bg-gradient-to-l"
      />

      {/* Content */}
      <div className="relative mx-auto flex min-h-[34rem] w-full max-w-6xl flex-col justify-center gap-8 px-6 py-24 sm:min-h-[42rem] lg:min-h-[46rem]">
        <div className="flex max-w-xl flex-col gap-6 text-start">
          {eyebrow && (
            <span className="lunia-animate-fade-up lunia-delay-1 inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.4em] text-[var(--color-teal-ink)]">
              <span aria-hidden="true" className="lunia-glow-mark" />
              {eyebrow}
            </span>
          )}
          <h1
            data-splittext
            className="lunia-animate-fade-up lunia-delay-2 font-[family-name:var(--font-display)] text-5xl font-medium leading-[1.05] tracking-tight text-[var(--color-ink)] sm:text-6xl lg:text-7xl"
          >
            {headline}
          </h1>
          {subhead && (
            <p className="lunia-animate-fade-up lunia-delay-3 max-w-md text-base leading-relaxed text-[var(--color-ink)]/75 sm:text-lg">
              {subhead}
            </p>
          )}
          <div className="lunia-animate-fade-up lunia-delay-4 mt-2 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link href={ctaHref} data-magnetic className={`lunia-btn lunia-btn-primary px-8 py-3.5 ${focusRingClass}`}>
              {ctaLabel}
            </Link>
            {secondaryLabel && secondaryHref && (
              <Link
                href={secondaryHref}
                className={`lunia-underline text-sm font-medium tracking-wide text-[var(--color-ink)] ${focusRingClass}`}
              >
                {secondaryLabel}
              </Link>
            )}
          </div>
          {floatingCard && <div className="lunia-animate-fade-up lunia-delay-5 mt-4">{floatingCard}</div>}
        </div>
      </div>
    </section>
  );
}
