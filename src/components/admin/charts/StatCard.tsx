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
    <div className="group relative flex flex-col gap-1.5 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)] transition-shadow hover:shadow-[var(--shadow-lg)]">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[var(--color-teal)] to-[var(--color-gold)] opacity-70"
      />
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-ink)]/55">{label}</span>
      <span className="font-[family-name:var(--font-display)] text-4xl font-medium leading-none tracking-tight text-[var(--color-ink)]">
        {value}
      </span>
      {subNote && <span className="text-xs text-[var(--color-ink)]/50">{subNote}</span>}
    </div>
  );
}
