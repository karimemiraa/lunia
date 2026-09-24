import Link from "next/link";
import type { SiteMedia } from "@/lib/siteMedia";
import { SmartMedia } from "./SmartMedia";

interface NewsTileProps {
  href: string;
  media: SiteMedia;
  category: string;
  title: string;
  excerpt?: string;
  date?: string;
  /** The wide, featured story at the top of the feed. */
  featured?: boolean;
}

// Apple Newsroom's story tile: a white rounded card, image on top (or beside,
// for the featured story), then a small category label, a bold headline and
// the date. The whole card is the link.
export function NewsTile({ href, media, category, title, excerpt, date, featured }: NewsTileProps) {
  return (
    <Link
      href={href}
      data-reveal
      className={`group flex overflow-hidden rounded-[28px] bg-white transition-shadow duration-500 hover:shadow-[0_30px_60px_-35px_rgba(34,63,58,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-4 ${
        featured ? "flex-col lg:grid lg:grid-cols-[1.4fr_1fr]" : "flex-col"
      }`}
    >
      <div className={`relative overflow-hidden bg-[var(--color-ice)] ${featured ? "aspect-[16/10] lg:aspect-auto lg:min-h-[26rem]" : "aspect-[16/10]"} [&_img]:transition-transform [&_img]:duration-[1.2s] [&_img]:ease-[cubic-bezier(.16,1,.3,1)] group-hover:[&_img]:scale-[1.04]`}>
        <SmartMedia media={media} alt="" />
      </div>
      <div className={`flex flex-1 flex-col ${featured ? "p-8 sm:p-10 lg:justify-center" : "p-7"}`}>
        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-teal-ink)]">{category}</span>
        <h3 className={`lx-display mt-3 text-[var(--color-ink)] ${featured ? "text-[clamp(2rem,1.4rem+1.8vw,3rem)] leading-[1.08]" : "text-[1.6rem] leading-[1.15]"}`}>{title}</h3>
        {excerpt && <p className={`mt-4 leading-relaxed text-[var(--color-ink)]/65 ${featured ? "text-[1.05rem]" : "line-clamp-2 text-[0.95rem]"}`}>{excerpt}</p>}
        {date && <span className={`text-[0.85rem] text-[var(--color-ink)]/45 ${featured ? "mt-6" : "mt-auto pt-5"}`}>{date}</span>}
      </div>
    </Link>
  );
}
