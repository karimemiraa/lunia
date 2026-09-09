"use client";
import { useMemo, useState, type ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  searchAccessor?: (row: T) => string;
  searchPlaceholder?: string;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  searchAccessor,
  searchPlaceholder = "Search...",
  emptyMessage = "No results.",
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!searchAccessor || !query.trim()) return rows;
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => searchAccessor(row).toLowerCase().includes(needle));
  }, [rows, query, searchAccessor]);

  return (
    <div className="flex flex-col gap-3">
      {searchAccessor && (
        <div className="relative max-w-sm">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-[var(--color-ink)]/40"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path strokeLinecap="round" d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="lunia-input ps-9"
          />
        </div>
      )}
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-ink)]/55"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-6 text-center text-[var(--color-ink)]/60">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="border-t border-[var(--line)] transition-colors hover:bg-[var(--color-teal)]/[0.06]"
                >
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-3 text-[var(--color-ink)]/90">
                      {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
