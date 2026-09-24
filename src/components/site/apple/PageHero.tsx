import type { ReactNode } from "react";
import Link from "next/link";
import type { SiteMedia } from "@/lib/siteMedia";
import { SmartMediaEager } from "./SmartMedia";
import { Chevron } from "../home/AppleHero";

interface HeroLink {
  href: string;
  label: string;
}

interface PageHeroProps {
  eyebrow?: string;
  title: string;
  lead?: string;
  cta?: HeroLink;
  secondary?: HeroLink;
  /** Optional hero film/photo shown on a stage that grows in as you scroll. */
  media?: SiteMedia;
  mediaAlt?: string;
  /** Extra content under the CTAs (e.g. a status line). */
  children?: ReactNode;
}

// Apple's page opener: a centered statement (small eyebrow, huge display
// title, one lead line, a pill + chevron link), then — optionally — a wide
// film/photo stage that scales up and squares its corners as it scrolls into
// view (CinematicScroll's [data-grow]).
export function PageHero({ eyebrow, title, lead, cta, secondary, media, mediaAlt, children }: PageHeroProps) {
  return (
    <section className="bg-[var(--color-page)] pb-[clamp(3.5rem,9svh,6rem)] pt-[clamp(4.5rem,11svh,8rem)]">
      <div className="mx-auto flex max-w-5xl flex-col items-center px-6 text-center">
        {eyebrow && (
          <span className="lx-eyebrow lunia-animate-fade-up">
            <span aria-hidden="true" className="lunia-glow-mark" />
            {eyebrow}
          </span>
        )}
        <h1 className="lx-display lx-h1 lunia-animate-fade-up lunia-delay-1 mt-5 text-[var(--color-ink)]">{title}</h1>
        {lead && <p className="lx-lead lunia-animate-fade-up lunia-delay-2 mt-6 max-w-2xl">{lead}</p>}
        {(cta || secondary) && (
          <div className="lunia-animate-fade-up lunia-delay-3 mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
            {cta && (
              <Link href={cta.href} data-magnetic className="lx-pill">
                {cta.label}
              </Link>
            )}
            {secondary && (
              <a href={secondary.href} className="lx-link">
                {secondary.label}
                <Chevron />
              </a>
            )}
          </div>
        )}
        {children}
      </div>

      {media && (
        <div className="mx-auto mt-[clamp(3rem,8svh,5rem)] w-full max-w-7xl px-4 sm:px-6">
          <div data-grow className="relative aspect-[4/5] overflow-hidden rounded-[28px] bg-[var(--color-ice)] sm:aspect-[16/9]">
            <SmartMediaEager media={media} alt={mediaAlt} />
          </div>
        </div>
      )}
    </section>
  );
}
