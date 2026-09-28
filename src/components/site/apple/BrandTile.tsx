import Link from "next/link";
import { Chevron } from "../home/AppleHero";

interface BrandTileProps {
  name: string;
  blurb?: string;
  href: string;
  logoKey?: string | null;
  linkLabel: string;
  className?: string;
}

// A partner tile: the brand's logo presented on a soft stage (or its name,
// set in the display face, until a logo is uploaded), then name, a short
// blurb and a Learn more link. The whole tile is the link.
export function BrandTile({ name, blurb, href, logoKey, linkLabel, className = "" }: BrandTileProps) {
  return (
    <Link
      href={href}
      data-reveal
      className={`lx-surface group flex flex-col rounded-[28px] p-6 transition-shadow duration-500 hover:shadow-[var(--shadow-lg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--color-page)] sm:p-7 ${className}`}
    >
      <div className="lx-light-stage lx-on-light flex aspect-[16/9] items-center justify-center rounded-[20px] p-8 transition-[filter] duration-500 group-hover:brightness-[0.98]">
        {logoKey ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded brand logo, arbitrary domain
          <img
            src={`/api/media/${logoKey}`}
            alt={name}
            loading="lazy"
            decoding="async"
            width={320}
            height={64}
            className="h-auto max-h-16 w-auto max-w-[70%] object-contain transition-transform duration-700 ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-[1.06]"
          />
        ) : (
          <span className="lx-display text-3xl text-[var(--color-ink)]">{name}</span>
        )}
      </div>
      <h3 className="lx-display mt-6 text-[1.7rem] leading-[1.1] text-[var(--color-ink)]">{name}</h3>
      {blurb && <p className="mt-3 line-clamp-3 text-[0.975rem] leading-relaxed text-[var(--color-ink)]/75">{blurb}</p>}
      <span className="lx-link mt-auto pt-5 text-[0.95rem]">
        {linkLabel}
        <Chevron />
      </span>
    </Link>
  );
}
