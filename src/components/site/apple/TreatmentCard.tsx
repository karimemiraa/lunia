import Link from "next/link";
import type { SiteMedia } from "@/lib/siteMedia";
import { SmartMedia } from "./SmartMedia";
import { Chevron } from "../home/AppleHero";

interface TreatmentCardProps {
  media: SiteMedia;
  name: string;
  summary?: string;
  /** e.g. "45 min · From SAR 250" */
  meta?: string;
  learnHref: string;
  learnLabel: string;
  bookHref: string;
  bookLabel: string;
  className?: string;
}

// A lineup card (Apple's "Explore the lineup"): photo on top, then the
// treatment name, a two-line summary, a quiet meta line (duration · price) and
// the two actions — a Book pill and a Learn more chevron link.
export function TreatmentCard({ media, name, summary, meta, learnHref, learnLabel, bookHref, bookLabel, className = "" }: TreatmentCardProps) {
  return (
    <article data-reveal className={`group flex shrink-0 flex-col overflow-hidden rounded-[28px] bg-white ${className}`}>
      <div className="relative aspect-[4/3] overflow-hidden bg-[var(--color-ice)] [&_img]:transition-transform [&_img]:duration-[1.2s] [&_img]:ease-[cubic-bezier(.16,1,.3,1)] group-hover:[&_img]:scale-[1.05]">
        <SmartMedia media={media} alt={name} />
      </div>
      <div className="flex flex-1 flex-col p-7">
        <h3 className="lx-display text-[1.75rem] leading-[1.1] text-[var(--color-ink)]">{name}</h3>
        {summary && <p className="mt-3 line-clamp-2 text-[0.975rem] leading-relaxed text-[var(--color-ink)]/65">{summary}</p>}
        {meta && <p className="mt-4 text-[0.85rem] font-medium text-[var(--color-teal-ink)]">{meta}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-3 pt-6">
          <Link href={bookHref} className="lx-pill px-5 py-2 text-[0.875rem]">
            {bookLabel}
          </Link>
          <Link href={learnHref} className="lx-link text-[0.9rem]">
            {learnLabel}
            <Chevron />
          </Link>
        </div>
      </div>
    </article>
  );
}
