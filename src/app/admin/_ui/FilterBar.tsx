import type { ReactNode } from "react";
import Link from "next/link";
import { labelTextClass } from "./labels";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDef {
  param: string;
  label: string;
  options: FilterOption[];
  /** Label for the "any" option (default "All"). */
  allLabel?: string;
}

interface FilterBarProps {
  /** Path the GET form submits to. */
  base: string;
  /** Current query params (strings only). */
  params: Record<string, string | undefined>;
  filters?: FilterDef[];
  /** Params that must survive "Clear all" (e.g. tab). */
  keep?: string[];
  /** Free-text search param name; renders a search box when set. */
  searchParam?: string;
  searchPlaceholder?: string;
  /** Extra controls inside the form (date inputs etc.). */
  children?: ReactNode;
  /** Right-side actions (export, print). */
  actions?: ReactNode;
  className?: string;
}

function buildHref(base: string, params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * URL-driven filter bar for server-rendered lists: a GET form with labelled
 * selects, active-filter chips (each removable) and "Clear all". Server-safe.
 */
export function FilterBar({ base, params, filters = [], keep = [], searchParam, searchPlaceholder = "Search…", children, actions, className = "" }: FilterBarProps) {
  const active = filters
    .map((f) => ({ f, value: params[f.param] }))
    .filter((x): x is { f: FilterDef; value: string } => !!x.value)
    .map(({ f, value }) => ({ param: f.param, label: f.label, valueLabel: f.options.find((o) => o.value === value)?.label ?? value }));
  const searchValue = searchParam ? params[searchParam] : undefined;
  const cleared = Object.fromEntries(keep.map((k) => [k, params[k]]));
  const hasActive = active.length > 0 || !!searchValue;

  return (
    <div className={`flex flex-col gap-3 print:hidden ${className}`}>
      <form method="get" action={base} className="flex flex-wrap items-end gap-3" role="search">
        {keep.map((k) => (params[k] ? <input key={k} type="hidden" name={k} value={params[k]} /> : null))}
        {searchParam && (
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1.5 text-sm sm:max-w-sm">
            <span className={labelTextClass}>Search</span>
            <input type="search" name={searchParam} defaultValue={searchValue} placeholder={searchPlaceholder} className="lunia-input min-h-11 text-base md:text-sm" />
          </label>
        )}
        {filters.map((f) => (
          <label key={f.param} className="flex flex-col gap-1.5 text-sm">
            <span className={labelTextClass}>{f.label}</span>
            <select name={f.param} defaultValue={params[f.param] ?? ""} className="lunia-input min-h-11 w-auto min-w-[9rem] text-base md:text-sm">
              <option value="">{f.allLabel ?? "All"}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        {children}
        <button type="submit" className="lunia-btn lunia-btn-forest-outline min-h-11">
          Apply
        </button>
        {actions && <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </form>
      {hasActive && (
        <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Active filters">
          {searchValue && (
            <Link href={buildHref(base, { ...params, [searchParam!]: undefined })} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[var(--color-teal)]/20 px-3 font-medium text-[var(--color-teal-ink)] hover:bg-[var(--color-teal)]/35">
              “{searchValue}”
              <span aria-hidden="true">×</span>
              <span className="sr-only">Remove search</span>
            </Link>
          )}
          {active.map((a) => (
            <Link key={a.param} href={buildHref(base, { ...params, [a.param]: undefined })} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[var(--color-teal)]/20 px-3 font-medium text-[var(--color-teal-ink)] hover:bg-[var(--color-teal)]/35">
              {a.label}: {a.valueLabel}
              <span aria-hidden="true">×</span>
              <span className="sr-only">Remove filter</span>
            </Link>
          ))}
          <Link href={buildHref(base, cleared)} className="inline-flex min-h-8 items-center px-2 text-[var(--color-ink)]/65 underline-offset-4 hover:underline">
            Clear all
          </Link>
        </div>
      )}
    </div>
  );
}

/** Quick chip links for a single param (All / A / B …). Server-safe. */
export function FilterChips({ base, param, values, active, defaultLabel = "All", params = {}, label = "Filter" }: { base: string; param: string; values: readonly (string | FilterOption)[]; active?: string; defaultLabel?: string; params?: Record<string, string | undefined>; label?: string }) {
  const opts: FilterOption[] = values.map((v) => (typeof v === "string" ? { value: v, label: v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ") } : v));
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {[{ value: "", label: defaultLabel }, ...opts].map((o) => {
        const isActive = o.value === "" ? !active : active === o.value;
        return (
          <Link
            key={o.value || "all"}
            href={buildHref(base, { ...params, [param]: o.value || undefined })}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-xs font-medium uppercase tracking-wide transition-colors ${
              isActive ? "bg-[var(--color-teal)] text-[var(--color-ink)]" : "border border-[var(--color-ink)]/20 text-[var(--color-ink)]/70 hover:bg-[var(--color-ink)]/5"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Link-based pagination for server lists (?page=N). */
export function Pagination({ page, pageCount, total, hrefFor, pageSize, className = "" }: { page: number; pageCount: number; total?: number; hrefFor: (page: number) => string; pageSize?: number; className?: string }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className={`flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-ink)]/65 ${className}`}>
      <span className="tabular-nums">
        {total !== undefined && pageSize ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : `Page ${page} of ${pageCount}`}
      </span>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
            Previous
          </Link>
        ) : (
          <span className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11 opacity-40" aria-disabled="true">
            Previous
          </span>
        )}
        <span className="px-2 tabular-nums">
          {page} / {pageCount}
        </span>
        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
            Next
          </Link>
        ) : (
          <span className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11 opacity-40" aria-disabled="true">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
