// Dependency-light stat tile for the admin dashboards: a label, a big
// value, and an optional sub-note (e.g. a comparison or count). Pure
// presentation -- callers pre-format the value/subNote strings (money,
// counts, etc.) so this component stays unit-agnostic.

interface StatCardProps {
  label: string;
  value: string;
  subNote?: string;
}

export function StatCard({ label, value, subNote }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-[var(--color-ink)]/10 bg-[var(--color-page)] p-5 shadow-sm">
      <span className="text-sm font-medium text-[var(--color-ink)]/60">{label}</span>
      <span className="text-3xl font-semibold tracking-tight text-[var(--color-ink)]">{value}</span>
      {subNote && <span className="text-xs text-[var(--color-ink)]/50">{subNote}</span>}
    </div>
  );
}
