import Link from "next/link";
import type { SiteMedia } from "@/lib/siteMedia";
import { SmartMedia } from "./SmartMedia";
import { Icon } from "./Icon";

interface FeatureRowProps {
  id?: string;
  media: SiteMedia;
  title: string;
  body?: string;
  meta?: string;
  bullets?: string[];
  cta?: { href: string; label: string };
  /** Put the media on the inline-end instead of the inline-start. */
  flip?: boolean;
}

// One Apple product-page feature block: a large rounded photo/film beside a
// headline, copy, a quiet meta line and a checked list — alternating sides row
// by row. The media wipes up into view (CinematicScroll's [data-clip]).
export function FeatureRow({ id, media, title, body, meta, bullets = [], cta, flip }: FeatureRowProps) {
  return (
    <article id={id} className="grid scroll-mt-32 items-center gap-8 lg:grid-cols-2 lg:gap-16">
      <div data-clip className={`relative aspect-[4/3] overflow-hidden rounded-[28px] bg-[var(--color-ice)] ${flip ? "lg:order-2" : ""}`}>
        <SmartMedia media={media} alt={title} />
      </div>
      <div data-reveal className={`flex flex-col ${flip ? "lg:order-1" : ""}`}>
        {meta && <span className="text-[0.85rem] font-semibold tracking-wide text-[var(--color-teal-ink)]">{meta}</span>}
        <h3 className="lx-display lx-h3 mt-3 text-[var(--color-ink)]">{title}</h3>
        {body && <p className="mt-4 max-w-lg text-[1.075rem] leading-relaxed text-[var(--color-ink)]/70">{body}</p>}
        {bullets.length > 0 && (
          <ul className="mt-6 flex flex-col gap-3">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-[0.98rem] leading-relaxed text-[var(--color-ink)]/80">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-teal)]/30 text-[var(--color-teal-ink)]">
                  <Icon name="check" className="h-3.5 w-3.5" />
                </span>
                {b}
              </li>
            ))}
          </ul>
        )}
        {cta && (
          <div className="mt-8">
            <Link href={cta.href} className="lx-pill">
              {cta.label}
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}
