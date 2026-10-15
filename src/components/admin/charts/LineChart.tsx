// Dependency-light line chart: a single inline SVG polyline, no charting
// library. Renders as a `role="img"` region with an aria-label summarizing
// the series for assistive tech, plus a visually-hidden (`sr-only`) table
// carrying the exact values.
//
// Server-safe: values are formatted here, the text is rendered (in the staff
// language) by LineChartView.

import { LineChartView } from "./ChartViews";

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
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const rows = data.map((d) => ({ key: d.date, label: d.date, value: d.value, text: valueFormatter(d.value) }));
  return (
    <LineChartView
      title={title}
      rows={rows}
      points={buildPoints(data)}
      totalText={valueFormatter(total)}
      emptyMessage={emptyMessage}
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
    />
  );
}
