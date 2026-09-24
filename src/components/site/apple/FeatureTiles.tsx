import Link from "next/link";
import { Icon, type IconName } from "./Icon";

export interface FeatureTile {
  icon: IconName;
  title: string;
  body?: string;
  href?: string;
  linkLabel?: string;
}

interface FeatureTilesProps {
  tiles: FeatureTile[];
  columns?: 2 | 3 | 4;
  /** Tile surface: white tiles on a tinted chapter, or soft tiles on white. */
  surface?: "white" | "mist" | "glass";
}

const COLS = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" } as const;
const SURFACE = {
  white: "bg-white",
  mist: "bg-[#eef4f2]",
  glass: "bg-white/[0.06] ring-1 ring-inset ring-white/10 text-[var(--color-cream)]",
} as const;

// Apple's incentive/feature tiles: a grid of rounded cards, each with a
// line icon, a crisp title and a short line of copy (plus an optional
// chevron link). Tiles lift in as they enter.
export function FeatureTiles({ tiles, columns = 4, surface = "white" }: FeatureTilesProps) {
  const glass = surface === "glass";
  return (
    <ul className={`grid grid-cols-1 gap-4 sm:gap-5 ${COLS[columns]}`}>
      {tiles.map((t) => (
        <li key={t.title} data-reveal className={`flex flex-col rounded-[24px] p-7 sm:p-8 ${SURFACE[surface]}`}>
          <span
            className={`flex h-12 w-12 items-center justify-center rounded-full ${glass ? "bg-white/10 text-[var(--color-teal)]" : "bg-[var(--color-teal)]/25 text-[var(--color-teal-ink)]"}`}
          >
            <Icon name={t.icon} />
          </span>
          <h3 className={`mt-6 text-[1.125rem] font-semibold leading-snug ${glass ? "text-[var(--color-cream)]" : "text-[var(--color-ink)]"}`}>{t.title}</h3>
          {t.body && <p className={`mt-2 text-[0.975rem] leading-relaxed ${glass ? "text-[var(--color-cream)]/70" : "text-[var(--color-ink)]/65"}`}>{t.body}</p>}
          {t.href && t.linkLabel && (
            <Link href={t.href} className="lx-link mt-4 text-[0.95rem]">
              {t.linkLabel}
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 3 5 5-5 5" />
              </svg>
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
