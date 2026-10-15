"use client";

// Client halves of BarChart / LineChart: the server-safe wrappers format the
// values (their formatter is a function, so it stays on that side) and these
// views render the text in the staff language. Titles and labels that callers
// pass in English go through the staff dictionary too (unknown text stays).
import { useStaffLocale, useStaffT } from "@/app/admin/_i18n/StaffI18n";

export interface FormattedDatum {
  key: string;
  label: string;
  value: number;
  text: string;
}

export function BarChartView({ title, rows, emptyMessage }: { title: string; rows: FormattedDatum[]; emptyMessage: string }) {
  const t = useStaffT();
  const comma = useStaffLocale() === "ar" ? "، " : ", ";
  const max = Math.max(1, ...rows.map((d) => d.value));
  const heading = t(title);
  const summary =
    rows.length === 0
      ? t("{title}: no data.", { title: heading })
      : `${heading}: ${rows.map((d) => `${t(d.label)} ${d.text}`).join(comma)}.`;

  return (
    <div className="rounded-lg border border-[var(--color-ink)]/10 bg-[var(--color-page)] p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-medium text-[var(--color-ink)]/70">{heading}</h3>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-ink)]/50" role="img" aria-label={summary}>
          {t(emptyMessage)}
        </p>
      ) : (
        <div className="flex flex-col gap-3" role="img" aria-label={summary}>
          {rows.map((datum) => (
            <div key={datum.key} className="flex flex-col gap-1" aria-hidden="true">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-[var(--color-ink)]/80">{t(datum.label)}</span>
                <span className="shrink-0 font-medium text-[var(--color-ink)]">{datum.text}</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-cream)]">
                <div className="h-full rounded-full bg-[var(--color-teal)]" style={{ width: `${Math.max(2, (datum.value / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <table className="sr-only">
        <caption>{heading}</caption>
        <thead>
          <tr>
            <th>{t("Label")}</th>
            <th>{t("Value")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((datum) => (
            <tr key={datum.key}>
              <td>{t(datum.label)}</td>
              <td>{datum.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LineChartView({ title, rows, points, totalText, emptyMessage, viewBox }: { title: string; rows: FormattedDatum[]; points: string; totalText: string; emptyMessage: string; viewBox: string }) {
  const t = useStaffT();
  const heading = t(title);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const summary =
    rows.length === 0
      ? t("{title}: no data.", { title: heading })
      : t("{title}: from {from} ({fromValue}) to {to} ({toValue}), total {total}.", {
          title: heading,
          from: first!.label,
          fromValue: first!.text,
          to: last!.label,
          toValue: last!.text,
          total: totalText,
        });

  return (
    <div className="rounded-lg border border-[var(--color-ink)]/10 bg-[var(--color-page)] p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-medium text-[var(--color-ink)]/70">{heading}</h3>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-ink)]/50" role="img" aria-label={summary}>
          {t(emptyMessage)}
        </p>
      ) : (
        <div role="img" aria-label={summary}>
          <svg viewBox={viewBox} className="h-28 w-full" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={points} fill="none" stroke="var(--color-teal)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          {/* Time runs left to right in both languages, like the line above. */}
          <div dir="ltr" className="mt-2 flex justify-between text-xs text-[var(--color-ink)]/50">
            <span>{first!.label}</span>
            <span>{last!.label}</span>
          </div>
        </div>
      )}

      <table className="sr-only">
        <caption>{heading}</caption>
        <thead>
          <tr>
            <th>{t("Date")}</th>
            <th>{t("Value")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((datum) => (
            <tr key={datum.key}>
              <td>{datum.label}</td>
              <td>{datum.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
