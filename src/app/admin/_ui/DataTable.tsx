"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { RowMenu, type MenuItem } from "./RowMenu";
import { EmptyState, type EmptyStateProps } from "./EmptyState";
import "./tokens.css";

export type CellValue = string | number | boolean | Date | null | undefined;

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  /** Plain value for sorting, searching and CSV. Defaults to row[key]. */
  value?: (row: T) => CellValue;
  sortable?: boolean;
  /** Right-aligned tabular numbers (money, counts). */
  numeric?: boolean;
  align?: "start" | "end" | "center";
  /** Skip in the stacked card view below md. */
  hideOnCard?: boolean;
  /** Used as the card title below md (defaults to the first column). */
  primary?: boolean;
  className?: string;
  /** Header cell class (e.g. a width). */
  headerClassName?: string;
}

export type SortDir = "asc" | "desc";

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Text for the client-side search box; omit to hide the box. */
  search?: (row: T) => string;
  searchPlaceholder?: string;
  /** Empty-state content (string or full EmptyState props). */
  empty?: string | EmptyStateProps;
  /** Overflow menu items per row. */
  rowActions?: (row: T) => MenuItem[];
  /** Whole-row link (rendered as the primary cell's link + card link). */
  rowHref?: (row: T) => string;
  /** Checkbox column + bulk action bar. */
  selectable?: boolean;
  bulkActions?: (selected: T[], clear: () => void) => ReactNode;
  /** Client-side pagination. 0 disables. */
  pageSize?: number;
  pageSizes?: number[];
  initialSort?: { key: string; dir: SortDir };
  /** File name (without .csv) enables the Export CSV button. */
  exportCsv?: string;
  /** Extra toolbar content (filters, chips) rendered next to the search. */
  toolbar?: ReactNode;
  /** Optional footer row (e.g. totals) — receives the rows on the page. */
  footer?: (rows: T[]) => ReactNode;
  caption?: string;
  /** Screen-reader label for the table. */
  ariaLabel?: string;
  dense?: boolean;
  /** Below this breakpoint rows become cards ("md" default, "lg" for wide tables). */
  cardsBelow?: "md" | "lg";
  className?: string;
  /** Sort/page callbacks for URL-driven state. */
  onSortChange?: (sort: { key: string; dir: SortDir } | null) => void;
  /** Called when a selected row set changes (optional for controlled selection). */
  onSelectionChange?: (rows: T[]) => void;
}

function cellValue<T>(col: Column<T>, row: T): CellValue {
  if (col.value) return col.value(row);
  const v = (row as Record<string, unknown>)[col.key];
  if (v === null || v === undefined) return v as null | undefined;
  if (v instanceof Date || typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
  return String(v);
}

function compare(a: CellValue, b: CellValue): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (a instanceof Date || b instanceof Date) return new Date(a as Date).getTime() - new Date(b as Date).getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function csvEscape(v: CellValue): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(columns: Column<T>[], rows: T[]): string {
  const cols = columns.filter((c) => c.key !== "__actions");
  const head = cols.map((c) => csvEscape(typeof c.header === "string" ? c.header : c.key)).join(",");
  const body = rows.map((r) => cols.map((c) => csvEscape(cellValue(c, r))).join(","));
  return [head, ...body].join("\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const SortIcon = ({ dir }: { dir: SortDir | null }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-3.5 w-3.5 shrink-0 transition-opacity ${dir ? "opacity-90" : "opacity-0 group-hover:opacity-50"}`}>
    {dir === "desc" ? <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" /> : <path strokeLinecap="round" strokeLinejoin="round" d="m6 15 6-6 6 6" />}
  </svg>
);

/**
 * The admin list primitive: sortable headers (aria-sort), sticky header,
 * calm rows with right-aligned tabular numbers, row overflow menus, bulk
 * selection, cards below md, an actionable empty state, pagination with a
 * page size, and CSV export for financial/HR lists.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  search,
  searchPlaceholder = "Search…",
  empty = "Nothing here yet.",
  rowActions,
  rowHref,
  selectable = false,
  bulkActions,
  pageSize = 25,
  pageSizes = [10, 25, 50, 100],
  initialSort,
  exportCsv,
  toolbar,
  footer,
  caption,
  ariaLabel,
  dense = false,
  cardsBelow = "md",
  className = "",
  onSortChange,
  onSelectionChange,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(initialSort ?? null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const filtered = useMemo(() => {
    if (!search || !query.trim()) return rows;
    const needle = query.trim().toLowerCase();
    return rows.filter((r) => search(r).toLowerCase().includes(needle));
  }, [rows, query, search]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => compare(cellValue(col, a), cellValue(col, b)) * dir);
  }, [filtered, sort, columns]);

  const pageCount = size > 0 ? Math.max(1, Math.ceil(sorted.length / size)) : 1;
  const safePage = Math.min(page, pageCount);
  const visible = size > 0 ? sorted.slice((safePage - 1) * size, safePage * size) : sorted;

  // Reset to page 1 when the data set or filter changes.
  useEffect(() => setPage(1), [query, rows.length, size]);

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(rowKey(r))), [rows, selected, rowKey]);
  useEffect(() => {
    onSelectionChange?.(selectedRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function toggleSort(col: Column<T>) {
    if (col.sortable === false) return;
    setSort((s) => {
      const next = !s || s.key !== col.key ? { key: col.key, dir: "asc" as SortDir } : s.dir === "asc" ? { key: col.key, dir: "desc" as SortDir } : null;
      onSortChange?.(next);
      return next;
    });
  }

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(rowKey(r)));
  function toggleAll() {
    setSelected((s) => {
      const n = new Set(s);
      if (allVisibleSelected) visible.forEach((r) => n.delete(rowKey(r)));
      else visible.forEach((r) => n.add(rowKey(r)));
      return n;
    });
  }
  const clearSelection = () => setSelected(new Set());

  const primary = columns.find((c) => c.primary) ?? columns[0]!;
  const cardCols = columns.filter((c) => c !== primary && !c.hideOnCard);
  const hasTools = !!search || !!toolbar || !!exportCsv;
  const hideClass = cardsBelow === "lg" ? "hidden lg:block" : "hidden md:block";
  const showClass = cardsBelow === "lg" ? "lg:hidden" : "md:hidden";
  const pad = dense ? "px-3 py-2" : "px-4 py-3";

  const alignClass = (c: Column<T>) => (c.numeric || c.align === "end" ? "text-end tabular-nums" : c.align === "center" ? "text-center" : "text-start");

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {hasTools && (
        <div className="flex flex-wrap items-center gap-2">
          {search && (
            <label className="relative w-full max-w-sm">
              <span className="sr-only">Search</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-[var(--color-ink)]/40">
                <circle cx="11" cy="11" r="6.5" />
                <path strokeLinecap="round" d="m20 20-3.5-3.5" />
              </svg>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} className="lunia-input ps-9 min-h-11 text-base md:text-sm" />
            </label>
          )}
          {toolbar}
          {exportCsv && (
            <button type="button" onClick={() => downloadCsv(exportCsv, toCsv(columns, sorted))} className="lunia-btn lunia-btn-ghost lunia-btn-sm ms-auto min-h-11" disabled={sorted.length === 0}>
              Export CSV
            </button>
          )}
        </div>
      )}

      {selectable && selected.size > 0 && (
        <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] bg-[var(--color-teal)]/15 px-4 py-2 text-sm">
          <span className="font-medium tabular-nums">{selected.size} selected</span>
          {bulkActions?.(selectedRows, clearSelection)}
          <button type="button" onClick={clearSelection} className="ms-auto min-h-11 px-2 text-[var(--color-ink)]/65 underline-offset-4 hover:underline">
            Clear
          </button>
        </div>
      )}

      {sorted.length === 0 ? (
        typeof empty === "string" ? (
          <EmptyState title={query ? "No matches" : empty} description={query ? "Try a different search." : undefined} />
        ) : (
          <EmptyState {...empty} title={query ? "No matches" : empty.title} description={query ? "Try a different search." : empty.description} action={query ? undefined : empty.action} />
        )
      ) : (
        <>
          <div className={`${hideClass} overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-md)]`}>
            <table className="w-full text-sm" aria-label={ariaLabel}>
              {caption && <caption className="sr-only">{caption}</caption>}
              <thead className="sticky top-0 z-10 bg-[var(--surface-2)]">
                <tr className="border-b border-[var(--line)]">
                  {selectable && (
                    <th scope="col" className={`${pad} w-11`}>
                      <input type="checkbox" aria-label="Select all rows on this page" checked={allVisibleSelected} onChange={toggleAll} className="h-5 w-5 accent-[var(--color-forest)]" />
                    </th>
                  )}
                  {columns.map((c) => {
                    const dir = sort?.key === c.key ? sort.dir : null;
                    const sortable = c.sortable !== false;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={sortable ? (dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none") : undefined}
                        className={`${pad} whitespace-nowrap text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-ink)]/60 ${alignClass(c)} ${c.headerClassName ?? ""}`}
                      >
                        {sortable ? (
                          <button type="button" onClick={() => toggleSort(c)} className={`group inline-flex min-h-8 items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] ${c.numeric || c.align === "end" ? "flex-row-reverse" : ""}`}>
                            <span>{c.header}</span>
                            <SortIcon dir={dir} />
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                  {rowActions && (
                    <th scope="col" className={`${pad} w-14 text-end`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const k = rowKey(row);
                  const isSel = selected.has(k);
                  return (
                    <tr key={k} className={`border-t border-[var(--line)] align-middle transition-colors hover:bg-[var(--color-teal)]/[0.06] ${isSel ? "bg-[var(--color-teal)]/10" : ""}`}>
                      {selectable && (
                        <td className={pad}>
                          <input
                            type="checkbox"
                            aria-label="Select row"
                            checked={isSel}
                            onChange={() =>
                              setSelected((s) => {
                                const n = new Set(s);
                                if (n.has(k)) n.delete(k);
                                else n.add(k);
                                return n;
                              })
                            }
                            className="h-5 w-5 accent-[var(--color-forest)]"
                          />
                        </td>
                      )}
                      {columns.map((c) => {
                        const content = c.render ? c.render(row) : String(cellValue(c, row) ?? "");
                        const link = rowHref && c === primary ? rowHref(row) : null;
                        return (
                          <td key={c.key} className={`${pad} text-[var(--color-ink)]/90 ${alignClass(c)} ${c.className ?? ""}`}>
                            {link ? (
                              <Link href={link} className="font-medium text-[var(--color-ink)] underline-offset-4 hover:underline">
                                {content}
                              </Link>
                            ) : (
                              content
                            )}
                          </td>
                        );
                      })}
                      {rowActions && (
                        <td className={`${pad} text-end`}>
                          <RowMenu items={rowActions(row)} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {footer && <tfoot className="border-t border-[var(--line-strong)] bg-[var(--surface-2)] font-medium">{footer(visible)}</tfoot>}
            </table>
          </div>

          <ul className={`${showClass} flex flex-col gap-3`}>
            {visible.map((row) => {
              const k = rowKey(row);
              const title = primary.render ? primary.render(row) : String(cellValue(primary, row) ?? "");
              const link = rowHref?.(row);
              return (
                <li key={k} className="lunia-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {selectable && (
                        <input
                          type="checkbox"
                          aria-label="Select row"
                          checked={selected.has(k)}
                          onChange={() =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (n.has(k)) n.delete(k);
                              else n.add(k);
                              return n;
                            })
                          }
                          className="h-5 w-5 shrink-0 accent-[var(--color-forest)]"
                        />
                      )}
                      <div className="min-w-0 text-base font-medium text-[var(--color-ink)]">
                        {link ? (
                          <Link href={link} className="underline-offset-4 hover:underline">
                            {title}
                          </Link>
                        ) : (
                          title
                        )}
                      </div>
                    </div>
                    {rowActions && <RowMenu items={rowActions(row)} />}
                  </div>
                  {cardCols.length > 0 && (
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      {cardCols.map((c) => (
                        <div key={c.key} className="min-w-0">
                          <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]/50">{c.header}</dt>
                          <dd className={`mt-0.5 break-words text-[var(--color-ink)]/90 ${c.numeric ? "tabular-nums" : ""}`}>{c.render ? c.render(row) : String(cellValue(c, row) ?? "")}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>

          {size > 0 && (sorted.length > pageSizes[0]! || pageCount > 1) && (
            <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-ink)]/65">
              <label className="inline-flex items-center gap-2">
                Rows per page
                <select value={size} onChange={(e) => setSize(Number(e.target.value))} className="lunia-input min-h-11 w-auto text-base md:text-sm">
                  {pageSizes.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <span className="tabular-nums">
                {(safePage - 1) * size + 1}–{Math.min(safePage * size, sorted.length)} of {sorted.length}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11 disabled:opacity-40" aria-label="Previous page">
                  Previous
                </button>
                <span className="px-2 tabular-nums" aria-current="page">
                  {safePage} / {pageCount}
                </span>
                <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11 disabled:opacity-40" aria-label="Next page">
                  Next
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
