import Link from "next/link";
import type { SiteMedia } from "@/lib/siteMedia";
import { SmartMedia } from "./SmartMedia";

interface MediaCardProps {
  media: SiteMedia;
  eyebrow?: string;
  title: string;
  body?: string;
  href?: string;
  /** Where the copy sits over the media. */
  textAt?: "top" | "bottom";
  className?: string;
}

// An Apple "Get to know" card: a tall, rounded media panel (photo or ambient
// film) with a short eyebrow + headline over a soft scrim. Width/aspect are set
// by the caller (gallery item vs grid cell).
export function MediaCard({ media, eyebrow, title, body, href, textAt = "top", className = "" }: MediaCardProps) {
  const scrim =
    textAt === "top"
      ? "lx-photo-scrim-top"
      : "lx-photo-scrim";

  const inner = (
    <>
      <div className="absolute inset-0 -z-10 [&_img]:transition-transform [&_img]:duration-[1.4s] [&_img]:ease-[cubic-bezier(.16,1,.3,1)] group-hover:[&_img]:scale-[1.045]">
        <SmartMedia media={media} alt="" />
      </div>
      <div aria-hidden="true" className={`absolute inset-0 -z-[5] ${scrim}`} />
      <div className={`flex flex-col gap-2 ${textAt === "bottom" ? "mt-auto" : ""}`}>
        {eyebrow && <span className="text-[0.8rem] font-semibold text-[var(--color-cream)]/85">{eyebrow}</span>}
        <h3 className="lx-display text-[clamp(1.6rem,1.2rem+1.1vw,2.2rem)] leading-[1.12] text-[var(--color-cream)]">{title}</h3>
        {body && <p className="mt-1 max-w-sm text-[0.98rem] leading-relaxed text-[var(--color-cream)]/85">{body}</p>}
      </div>
    </>
  );

  const base = `group relative isolate flex flex-col overflow-hidden rounded-[28px] bg-[var(--color-alice)] p-7 sm:p-8 ${className}`;
  return href ? (
    <Link href={href} data-reveal className={`${base} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--color-page)]`}>
      {inner}
    </Link>
  ) : (
    <article data-reveal className={base}>
      {inner}
    </article>
  );
}
