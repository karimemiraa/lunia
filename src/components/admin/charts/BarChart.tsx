// Dependency-light horizontal bar chart (plain divs, no SVG/canvas needed
// for bars). Renders as a `role="img"` region with an aria-label summarizing
// the data for assistive tech, plus a visually-hidden (`sr-only`) table
// carrying the exact values -- belt-and-suspenders accessibility per the
// Stage-5 brief ("charts must be accessible").
//
// Server-safe: values are formatted here, the text is rendered (in the staff
// language) by BarChartView.

import { BarChartView } from "./ChartViews";

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
  const rows = data.map((d) => ({ key: d.label, label: d.label, value: d.value, text: valueFormatter(d.value) }));
  return <BarChartView title={title} rows={rows} emptyMessage={emptyMessage} />;
}
