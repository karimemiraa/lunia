// Tiny inline bar sparkline for KPI tiles (server-safe SVG). Values are
// summarised in an aria-label; the bars themselves are decorative.

interface SparklineProps {
  points: { label: string; value: number }[];
  title: string;
  highlightLast?: boolean;
}

export function Sparkline({ points, title, highlightLast = true }: SparklineProps) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const w = 100;
  const h = 28;
  const gap = 3;
  const bw = (w - gap * (points.length - 1)) / Math.max(1, points.length);
  const summary = `${title}: ${points.map((p) => `${p.label} ${p.value}`).join(", ")}.`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={summary} className="h-7 w-full">
      {points.map((p, i) => {
        const bh = Math.max(2, (p.value / max) * (h - 2));
        const last = i === points.length - 1;
        return (
          <rect
            key={p.label + i}
            x={i * (bw + gap)}
            y={h - bh}
            width={bw}
            height={bh}
            rx={1.5}
            fill={last && highlightLast ? "var(--color-teal-ink)" : "var(--color-teal)"}
            opacity={last && highlightLast ? 1 : 0.75}
          />
        );
      })}
    </svg>
  );
}
