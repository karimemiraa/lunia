// Small shared presentational bits for the assistant and call-back admin pages.

const OUTCOME_STYLES: Record<string, string> = {
  BOOKED: "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]",
  CALLBACK: "bg-[var(--color-teal)]/25 text-[var(--color-ink)]",
  WHATSAPP: "bg-[#25D366]/15 text-[var(--color-ink)]",
  LEAD: "bg-[var(--color-gold)]/25 text-[var(--color-ink)]",
  ABANDONED: "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/60",
  IN_PROGRESS: "bg-[var(--color-ice)] text-[var(--color-ink)]/80",
  OPEN: "bg-[var(--color-gold)]/25 text-[var(--color-ink)]",
  NO_ANSWER: "bg-[var(--color-dragonfruit)]/40 text-[var(--color-ink)]",
  DONE: "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]",
  CANCELLED: "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/60",
};

export function StatusPill({ value }: { value: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide ${
        OUTCOME_STYLES[value] ?? "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70"
      }`}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(date));
}

export function FilterChips({
  base,
  param,
  values,
  active,
  defaultLabel = "All",
}: {
  base: string;
  param: string;
  values: readonly string[];
  active?: string;
  defaultLabel?: string;
}) {
  return (
    <nav aria-label="Filter" className="mb-6 flex flex-wrap gap-2">
      {(["", ...values] as const).map((v) => {
        const isActive = v === "" ? !active : active === v;
        return (
          <a
            key={v || "all"}
            href={v ? `${base}?${param}=${v}` : base}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-xs font-medium uppercase tracking-wide transition-colors ${
              isActive
                ? "bg-[var(--color-teal)] text-[var(--color-ink)]"
                : "border border-[var(--color-ink)]/20 text-[var(--color-ink)]/70 hover:bg-[var(--color-ink)]/5"
            }`}
          >
            {(v || defaultLabel).replace(/_/g, " ")}
          </a>
        );
      })}
    </nav>
  );
}
