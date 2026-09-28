import type { ReactNode } from "react";
import Link from "next/link";
import "./tokens.css";

/** A card with a small uppercase title row and optional actions. */
export function SectionCard({ title, description, actions, children, className = "", id, padded = true }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string; padded?: boolean }) {
  return (
    <section id={id} className={`lunia-card flex flex-col ${padded ? "p-5" : ""} ${className}`}>
      {(title || actions) && (
        <div className={`flex flex-wrap items-start justify-between gap-3 ${padded ? "mb-4" : "border-b border-[var(--line)] px-5 py-4"}`}>
          <div>
            {title && <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--color-ink)]/65">{title}</h2>}
            {description && <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-ink)]/55">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Groups related fields in a long form: a fieldset with a legend and helper
 * text, laid out as a two-column grid on wide screens.
 */
export function FormSection({ title, description, children, columns = 2, className = "", trailing }: { title: ReactNode; description?: ReactNode; children: ReactNode; columns?: 1 | 2 | 3; className?: string; trailing?: ReactNode }) {
  const grid = columns === 1 ? "grid-cols-1" : columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <fieldset className={`lunia-card min-w-0 p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <legend className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">{title}</legend>
          {description && <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--color-ink)]/60">{description}</p>}
        </div>
        {trailing}
      </div>
      <div className={`grid gap-4 ${grid}`}>{children}</div>
    </fieldset>
  );
}

/** Sticky action bar at the end of a long form: one primary CTA on the end side. */
export function FormActions({ children, status, className = "" }: { children: ReactNode; status?: ReactNode; className?: string }) {
  return (
    <div className={`sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]/90 px-4 py-3 shadow-[var(--shadow-md)] backdrop-blur ${className}`}>
      {status && <div className="me-auto min-w-0">{status}</div>}
      {children}
    </div>
  );
}

export function KpiCard({ label, value, hint, href, tone = "neutral", trend, className = "" }: { label: ReactNode; value: ReactNode; hint?: ReactNode; href?: string; tone?: "neutral" | "success" | "warning" | "danger" | "accent"; trend?: { value: string; up?: boolean }; className?: string }) {
  const valueColor = tone === "danger" ? "text-[var(--status-danger-ink)]" : tone === "warning" ? "text-[var(--status-warning-ink)]" : tone === "success" ? "text-[var(--status-success-ink)]" : "text-[var(--color-ink)]";
  const body = (
    <div className={`lunia-card flex h-full flex-col p-5 ${href ? "transition-shadow hover:shadow-[var(--shadow-glow)]" : ""} ${className}`}>
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink)]/55">{label}</p>
      <p className={`mt-2 font-[family-name:var(--font-display)] text-3xl leading-none tabular-nums ${valueColor}`}>{value}</p>
      {(hint || trend) && (
        <p className="mt-2 flex items-center gap-2 text-xs text-[var(--color-ink)]/55">
          {trend && <span className={`tabular-nums ${trend.up === undefined ? "" : trend.up ? "text-[var(--status-success-ink)]" : "text-[var(--status-danger-ink)]"}`}>{trend.value}</span>}
          {hint}
        </p>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-[var(--radius-lg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)]">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Small key/value list used in detail sidebars. */
export function DescriptionList({ items, className = "" }: { items: { label: ReactNode; value: ReactNode; numeric?: boolean }[]; className?: string }) {
  return (
    <dl className={`grid gap-2 text-sm ${className}`}>
      {items.map((it, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4">
          <dt className="text-[var(--color-ink)]/60">{it.label}</dt>
          <dd className={`text-end text-[var(--color-ink)] ${it.numeric ? "tabular-nums" : ""}`}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface Step {
  label: string;
  hint?: string;
}

/** Progress stepper for multi-step flows (POS: Issued → Take payment → Send). */
export function Stepper({ steps, current, className = "" }: { steps: Step[]; current: number; className?: string }) {
  return (
    <ol className={`flex flex-wrap items-center gap-x-2 gap-y-3 ${className}`} aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.label} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                done ? "bg-[var(--status-success-bg)] text-[var(--status-success-ink)]" : active ? "bg-[var(--color-teal)] text-[var(--color-ink)]" : "bg-[var(--surface-2)] text-[var(--color-ink)]/50"
              }`}
            >
              {done ? (
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span className={`text-sm ${active ? "font-medium text-[var(--color-ink)]" : done ? "text-[var(--color-ink)]/80" : "text-[var(--color-ink)]/50"}`}>
              {s.label}
              {done && <span className="sr-only"> (done)</span>}
              {s.hint && <span className="ms-1 hidden text-xs text-[var(--color-ink)]/45 sm:inline">{s.hint}</span>}
            </span>
            {i < steps.length - 1 && <span aria-hidden="true" className="mx-1 hidden h-px w-8 bg-[var(--line-strong)] sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}

/** Sub-navigation tabs for a module (inventory, HR…). */
export function SubNav({ items, active, label }: { items: { href: string; label: string }[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--line)]">
      {items.map((item) => {
        const isActive = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 px-4 text-sm transition-colors ${
              isActive ? "border-[var(--color-teal-ink)] font-medium text-[var(--color-ink)]" : "border-transparent text-[var(--color-ink)]/60 hover:text-[var(--color-ink)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
