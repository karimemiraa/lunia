// Dependency-light horizontal bar chart (plain divs, no SVG/canvas needed
// for bars). Renders as a `role="img"` region with an aria-label summarizing
// the data for assistive tech, plus a visually-hidden (`sr-only`) table
// carrying the exact values -- belt-and-suspenders accessibility per the
// Stage-5 brief ("charts must be accessible").

export interface BarChartDatum {
  label: string;
  value: number;
}

interface BarChartProps {
  title: string;
  data: BarChartDatum[];
  valueFormatter?: (value: number) => string;
  emptyMessage?: string;
}

const defaultFormatter = (value: number) => value.toLocaleString("en-US");

export function BarChart({ title, data, valueFormatter = defaultFormatter, emptyMessage = "No data yet." }: BarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));

  const summary =
    data.length === 0
      ? `${title}: no data.`
      : `${title}: ${data.map((d) => `${d.label} ${valueFormatter(d.value)}`).join(", ")}.`;

  return (
    <div className="rounded-lg border border-[var(--color-ink)]/10 bg-[var(--color-page)] p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-medium text-[var(--color-ink)]/70">{title}</h3>

      {data.length === 0 ? (
        <p className="text-sm text-[var(--color-ink)]/50" role="img" aria-label={summary}>
          {emptyMessage}
        </p>
      ) : (
        <div className="flex flex-col gap-3" role="img" aria-label={summary}>
          {data.map((datum) => (
            <div key={datum.label} className="flex flex-col gap-1" aria-hidden="true">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-[var(--color-ink)]/80">{datum.label}</span>
                <span className="shrink-0 font-medium text-[var(--color-ink)]">{valueFormatter(datum.value)}</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-cream)]">
                <div
                  className="h-full rounded-full bg-[var(--color-teal)]"
                  style={{ width: `${Math.max(2, (datum.value / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Label</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((datum) => (
            <tr key={datum.label}>
              <td>{datum.label}</td>
              <td>{valueFormatter(datum.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
