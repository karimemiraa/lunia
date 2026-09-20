interface Stat {
  value: number;
  suffix?: string;
  label: string;
}

interface StatsBandProps {
  stats: Stat[];
}

// A quiet band of animated counters (rivive-style): each number counts up from
// zero as it scrolls into view (driven by CinematicScroll's [data-count]
// handler). Degrades to the final number with no JS.
export function StatsBand({ stats }: StatsBandProps) {
  return (
    <div data-reveal className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col items-center gap-2 text-center">
          <span className="font-[family-name:var(--font-display)] text-5xl font-medium leading-none text-[var(--color-teal-ink)] sm:text-6xl">
            <span data-count={s.value} data-count-suffix={s.suffix ?? ""}>
              0{s.suffix ?? ""}
            </span>
          </span>
          <span className="max-w-[12rem] text-sm leading-snug text-[var(--color-ink)]/65">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
