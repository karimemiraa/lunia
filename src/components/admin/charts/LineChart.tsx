// Dependency-light line chart: a single inline SVG polyline, no charting
// library. Renders as a `role="img"` region with an aria-label summarizing
// the series for assistive tech, plus a visually-hidden (`sr-only`) table
// carrying the exact values.

export interface LineChartDatum {
  date: string;
  value: number;
}

interface LineChartProps {
  title: string;
  data: LineChartDatum[];
  valueFormatter?: (value: number) => string;
  emptyMessage?: string;
}

const defaultFormatter = (value: number) => value.toLocaleString("en-US");

const VIEW_WIDTH = 480;
const VIEW_HEIGHT = 120;
const PADDING = 8;

function buildPoints(data: LineChartDatum[]): string {
  if (data.length === 0) return "";
  const values = data.map((d) => d.value);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const span = max - min || 1;
  const usableWidth = VIEW_WIDTH - PADDING * 2;
  const usableHeight = VIEW_HEIGHT - PADDING * 2;

  return data
    .map((datum, index) => {
      const x = data.length === 1 ? PADDING : PADDING + (index / (data.length - 1)) * usableWidth;
      const y = PADDING + usableHeight - ((datum.value - min) / span) * usableHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function LineChart({ title, data, valueFormatter = defaultFormatter, emptyMessage = "No data yet." }: LineChartProps) {
  const points = buildPoints(data);
  const first = data[0];
  const last = data[data.length - 1];
  const total = data.reduce((sum, d) => sum + d.value, 0);

  const summary =
    data.length === 0
      ? `${title}: no data.`
      : `${title}: from ${first!.date} (${valueFormatter(first!.value)}) to ${last!.date} (${valueFormatter(last!.value)}), total ${valueFormatter(total)}.`;

  return (
    <div className="rounded-lg border border-[var(--color-ink)]/10 bg-[var(--color-page)] p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-medium text-[var(--color-ink)]/70">{title}</h3>

      {data.length === 0 ? (
        <p className="text-sm text-[var(--color-ink)]/50" role="img" aria-label={summary}>
          {emptyMessage}
        </p>
      ) : (
        <div role="img" aria-label={summary}>
          <svg
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            className="h-28 w-full"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline points={points} fill="none" stroke="var(--color-teal)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <div className="mt-2 flex justify-between text-xs text-[var(--color-ink)]/50">
            <span>{first!.date}</span>
            <span>{last!.date}</span>
          </div>
        </div>
      )}

      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((datum) => (
            <tr key={datum.date}>
              <td>{datum.date}</td>
              <td>{valueFormatter(datum.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
