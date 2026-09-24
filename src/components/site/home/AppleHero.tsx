import type { ReactNode } from "react";
import Link from "next/link";
import { MediaFrame } from "../MediaFrame";

interface AppleHeroProps {
  eyebrow: string;
  headline: string;
  subhead?: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  /** Line that resolves over the full-bleed film at the end of the scroll. */
  caption: string;
  /** CMS hero media — when set it replaces the default brand film. */
  media?: { key: string; kind?: "IMAGE" | "VIDEO" } | null;
  /** Optional trust chip (aggregate rating) under the CTAs. */
  trust?: ReactNode;
}

export function Chevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 3 5 5-5 5" />
    </svg>
  );
}

// Apple-style product-launch opener. The headline owns the first screen; the
// brand film sits just beneath it as a rounded stage and, as you scroll, rises
// and grows until it fills the viewport while the copy lifts away — then a
// single line resolves over the film. All of that is scrubbed by
// CinematicScroll ([data-apple-hero]); without JS / with reduced motion this is
// a static, complete composition (headline + the film peeking below).
export function AppleHero({
  eyebrow,
  headline,
  subhead,
  ctaLabel,
  ctaHref,
  secondaryLabel,
  secondaryHref,
  caption,
  media,
  trust,
}: AppleHeroProps) {
  return (
    <section data-apple-hero className="lx-hero bg-[var(--color-page)]">
      <div className="lx-hero-viewport">
        <div data-hero-stage className="lx-hero-stage">
          {media?.key ? (
            <MediaFrame mediaKey={media.key} kind={media.kind} alt="" aspectClassName="h-full" rounded={false} className="h-full w-full" />
          ) : (
            <video autoPlay muted loop playsInline preload="auto" poster="/media/hero.jpg" aria-hidden="true">
              <source src="/media/hero-m.mp4" type="video/mp4" media="(max-width: 767px)" />
              <source src="/media/hero.mp4" type="video/mp4" />
            </video>
          )}
          <div
            data-hero-shade
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-[#10201d]/70 via-[#10201d]/10 to-transparent opacity-0"
          />
          <div
            data-hero-caption
            className="lx-hero-caption absolute inset-x-0 bottom-0 mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 pb-[12svh] text-center"
          >
            <p className="lx-display lx-h2 text-[var(--color-cream)]">{caption}</p>
            <Link href={ctaHref} className="lx-pill">
              {ctaLabel}
            </Link>
          </div>
        </div>

        <div
          data-hero-copy
          className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-6 pt-[max(6.5rem,12svh)] text-center"
        >
          <span className="lx-eyebrow">
            <span aria-hidden="true" className="lunia-glow-mark" />
            {eyebrow}
          </span>
          <h1 className="lx-display lx-h1 mt-5 text-[var(--color-ink)]">{headline}</h1>
          {subhead && <p className="lx-lead mt-5 max-w-2xl">{subhead}</p>}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
            <Link href={ctaHref} data-magnetic className="lx-pill">
              {ctaLabel}
            </Link>
            <a href={secondaryHref} className="lx-link">
              {secondaryLabel}
              <Chevron />
            </a>
          </div>
          {trust && <div className="mt-6">{trust}</div>}
        </div>
      </div>
    </section>
  );
}
