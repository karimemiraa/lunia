import type { ReactNode } from "react";
import Link from "next/link";
import { labelTextClass } from "./labels";

/**
 * From/To date inputs for a GET form plus quick-range shortcut links.
 * Server-safe; pair it with FilterBar (as `children`) or use standalone.
 */
export function DateRangeFields({ fromISO, toISO, fromName = "from", toName = "to" }: { fromISO: string; toISO: string; fromName?: string; toName?: string }) {
  return (
    <>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className={labelTextClass}>From</span>
        <input type="date" name={fromName} defaultValue={fromISO} max={toISO} className="lunia-input min-h-11 text-base md:text-sm" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className={labelTextClass}>To</span>
        <input type="date" name={toName} defaultValue={toISO} min={fromISO} className="lunia-input min-h-11 text-base md:text-sm" />
      </label>
    </>
  );
}

export function rangeShortcuts(todayISO: string): { label: string; from: string; to: string }[] {
  const [y, m, d] = todayISO.split("-").map(Number) as [number, number, number];
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastMonth = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const lastMonthEnd = new Date(Date.UTC(lastMonth.y, lastMonth.m, 0)).getUTCDate();
  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  const weekAgo = new Date(Date.UTC(y, m - 1, d - 6));
  return [
    { label: "Today", from: todayISO, to: todayISO },
    { label: "Last 7 days", from: `${weekAgo.getUTCFullYear()}-${pad(weekAgo.getUTCMonth() + 1)}-${pad(weekAgo.getUTCDate())}`, to: todayISO },
    { label: "This month", from: `${y}-${pad(m)}-01`, to: todayISO },
    { label: "Last month", from: `${lastMonth.y}-${pad(lastMonth.m)}-01`, to: `${lastMonth.y}-${pad(lastMonth.m)}-${pad(lastMonthEnd)}` },
    { label: "This quarter", from: `${y}-${pad(qStartMonth)}-01`, to: todayISO },
    { label: "Year to date", from: `${y}-01-01`, to: todayISO },
  ];
}

export function DateRangeShortcuts({ base, todayISO, params, activeFrom, activeTo, only }: { base: string; todayISO: string; params: Record<string, string | undefined>; activeFrom?: string; activeTo?: string; only?: string[] }): ReactNode {
  const list = rangeShortcuts(todayISO).filter((s) => !only || only.includes(s.label));
  return (
    <div className="flex flex-wrap gap-2 print:hidden" aria-label="Quick ranges">
      {list.map((s) => {
        const qs = new URLSearchParams(Object.entries({ ...params, from: s.from, to: s.to }).filter(([, v]) => v) as [string, string][]);
        const isActive = activeFrom === s.from && activeTo === s.to;
        return (
          <Link key={s.label} href={`${base}?${qs.toString()}`} aria-current={isActive ? "page" : undefined} className={`lunia-btn lunia-btn-sm min-h-11 ${isActive ? "lunia-btn-forest" : "lunia-btn-ghost"}`}>
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
