// Small presentational pieces shared by the accounting pages: section
// headings, a money table that becomes stacked cards on narrow screens, the
// date-range picker and print helpers. Server components (no state).

import type { ReactNode } from "react";
import Link from "next/link";
import { PrintButton } from "./PrintButton";

export const labelClass = "text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60";

export function Section({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 break-inside-avoid">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-[var(--color-ink)]/50">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export interface MoneyColumn<T> {
  key: string;
  header: string;
  align?: "start" | "end";
  render: (row: T) => ReactNode;
}

/**
 * A plain table on md+ screens and a stack of label/value cards below that,
 * so long financial rows stay readable on an iPad in portrait or a phone.
 * `emphasize` bolds a row (totals).
 */
export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "Nothing for this period.",
  emphasize,
  testId,
}: {
  columns: MoneyColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
  emphasize?: (row: T) => boolean;
  testId?: string;
}) {
  if (rows.length === 0) {
    return <p className="lunia-card px-5 py-6 text-center text-sm text-[var(--color-ink)]/60">{emptyMessage}</p>;
  }
  return (
    <div data-testid={testId}>
      <div className="hidden overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-md)] md:block print:block print:shadow-none">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-ink)]/55 ${c.align === "end" ? "text-end" : "text-start"}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={`border-t border-[var(--line)] ${emphasize?.(row) ? "bg-[var(--surface-2)] font-semibold" : ""}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-2.5 text-[var(--color-ink)]/90 ${c.align === "end" ? "text-end tabular-nums" : ""}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden print:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className={`lunia-card flex flex-col gap-1.5 px-4 py-3 text-sm ${emphasize?.(row) ? "font-semibold" : ""}`}>
            {columns.map((c, i) =>
              i === 0 ? (
                <div key={c.key} className="text-base text-[var(--color-ink)]">
                  {c.render(row)}
                </div>
              ) : (
                <div key={c.key} className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-[var(--color-ink)]/55">{c.header}</span>
                  <span className="text-end tabular-nums text-[var(--color-ink)]/90">{c.render(row)}</span>
                </div>
              ),
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Colors a signed amount: negative in red. */
export function Signed({ minor, children }: { minor: number; children: ReactNode }) {
  return <span className={minor < 0 ? "text-[#b42318]" : undefined}>{children}</span>;
}

/**
 * GET form for the date range. Extra hidden params (tab, period, filters)
 * are preserved so changing dates never resets the view.
 */
export function RangeForm({
  action,
  fromISO,
  toISO,
  hidden = {},
  children,
}: {
  action: string;
  fromISO: string;
  toISO: string;
  hidden?: Record<string, string | undefined>;
  children?: ReactNode;
}) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3 print:hidden" data-testid="accounting-range-form">
      {Object.entries(hidden).map(([name, value]) => (value ? <input key={name} type="hidden" name={name} value={value} /> : null))}
      <label className="flex flex-col gap-1 text-sm">
        <span className={labelClass}>From</span>
        <input type="date" name="from" defaultValue={fromISO} className="lunia-input min-h-11" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className={labelClass}>To</span>
        <input type="date" name="to" defaultValue={toISO} className="lunia-input min-h-11" />
      </label>
      {children}
      <button type="submit" className="lunia-btn lunia-btn-forest min-h-11">
        Apply
      </button>
    </form>
  );
}

/** Quick range shortcuts (this month / last month / this quarter / year to date). */
export function RangeShortcuts({ base, todayISO, params }: { base: string; todayISO: string; params: Record<string, string | undefined> }) {
  const [y, m] = todayISO.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastMonth = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const lastMonthEnd = new Date(Date.UTC(lastMonth.y, lastMonth.m, 0)).getUTCDate();
  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  const shortcuts = [
    { label: "This month", from: `${y}-${pad(m)}-01`, to: todayISO },
    { label: "Last month", from: `${lastMonth.y}-${pad(lastMonth.m)}-01`, to: `${lastMonth.y}-${pad(lastMonth.m)}-${pad(lastMonthEnd)}` },
    { label: "This quarter", from: `${y}-${pad(qStartMonth)}-01`, to: todayISO },
    { label: "Year to date", from: `${y}-01-01`, to: todayISO },
  ];
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {shortcuts.map((s) => {
        const qs = new URLSearchParams(Object.entries({ ...params, from: s.from, to: s.to }).filter(([, v]) => v) as [string, string][]);
        return (
          <Link key={s.label} href={`${base}?${qs.toString()}`} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Export + print actions for a report header. */
export function ReportActions({ exportHref }: { exportHref: string }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <a href={exportHref} className="lunia-btn lunia-btn-forest-outline min-h-11" data-testid="accounting-export-csv">
        Export CSV
      </a>
      <PrintButton />
    </div>
  );
}

/**
 * Print stylesheet for accounting pages: hides the admin chrome (nav, search,
 * notification bell) so a printed report is just the report.
 */
export function PrintStyles() {
  return (
    <style>{`@media print {
  nav[aria-label="Admin navigation"], main > div:has(> form[role="search"]) { display: none !important; }
  .lunia-admin-bg { background: #fff !important; }
  main { max-width: none !important; padding: 0 !important; }
  .lunia-card { box-shadow: none !important; }
  a { text-decoration: none; }
}`}</style>
  );
}
