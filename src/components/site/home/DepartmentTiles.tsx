import Link from "next/link";
import { MediaFrame } from "../MediaFrame";
import { Chevron } from "./AppleHero";

interface DepartmentTile {
  id: string;
  href: string;
  name: string;
  tagline: string;
  media?: { key: string; kind: "IMAGE" | "VIDEO" } | null;
}

interface DepartmentTilesProps {
  eyebrow: string;
  heading: string;
  intro: string;
  exploreLabel: string;
  departments: DepartmentTile[];
}

// The three departments as tall, image-led cards (Apple's "explore the
// lineup" tiles): full-bleed CMS photography, a numbered caption and an
// Explore affordance. A 3-up grid on desktop; a native swipe carousel with
// snap on mobile. Images ease in on hover; the cards lift in as they enter.
export function DepartmentTiles({ eyebrow, heading, intro, exploreLabel, departments }: DepartmentTilesProps) {
  const total = String(departments.length).padStart(2, "0");

  return (
    <section className="bg-[color-mix(in_srgb,var(--color-cream)_55%,var(--color-page))] py-[clamp(6rem,14svh,10rem)]">
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-6">
        <header className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <span className="lx-eyebrow lunia-scroll">
            <span aria-hidden="true" className="lunia-glow-mark" />
            {eyebrow}
          </span>
          <h2 data-splittext className="lx-display lx-h2 mt-5 text-[var(--color-ink)]">
            {heading}
          </h2>
          <p className="lx-lead lunia-scroll mt-6 max-w-2xl">{intro}</p>
        </header>
      </div>

      <div className="lx-snap mt-14 flex gap-4 overflow-x-auto scroll-px-5 px-5 pb-4 sm:scroll-px-6 sm:px-6 lg:mx-auto lg:mt-20 lg:grid lg:max-w-7xl lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:pb-0">
        {departments.map((d, i) => (
          <Link
            key={d.id}
            href={d.href}
            data-reveal
            className="lx-card group flex aspect-[3/4] w-[82vw] max-w-[26rem] shrink-0 flex-col justify-end p-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--color-page)] sm:w-[23rem] sm:p-8 lg:w-auto lg:max-w-none"
          >
            <div className="lx-card-media">
              <MediaFrame mediaKey={d.media?.key} kind={d.media?.kind} alt="" aspectClassName="h-full" rounded={false} className="h-full w-full" />
            </div>
            <div aria-hidden="true" className="absolute inset-0 -z-[1] bg-gradient-to-t from-[#10201d]/85 via-[#10201d]/25 to-transparent" />
            <span className="text-sm font-medium tracking-[0.2em] text-[var(--color-teal)]">
              {String(i + 1).padStart(2, "0")} / {total}
            </span>
            <h3 className="lx-display mt-3 text-[2.1rem] leading-[1.05] text-[var(--color-cream)] sm:text-[2.4rem]">{d.name}</h3>
            <p className="mt-3 max-w-xs text-[0.98rem] leading-relaxed text-[var(--color-cream)]/80">{d.tagline}</p>
            <span className="mt-6 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-[var(--color-cream)] backdrop-blur-md transition-colors group-hover:bg-white/25 [&_svg]:h-3.5 [&_svg]:w-3.5 rtl:[&_svg]:-scale-x-100">
              {exploreLabel}
              <Chevron />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
