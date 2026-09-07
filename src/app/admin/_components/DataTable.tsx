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
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          className="w-full max-w-sm rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm focus:border-[var(--color-teal)] focus:outline-none"
        />
      )}
      <div className="overflow-x-auto rounded border border-[var(--color-ink)]/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--color-cream)]/60">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-2 font-medium text-[var(--color-ink)]">
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
                <tr key={rowKey(row)} className="border-t border-[var(--color-ink)]/10">
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-2 text-[var(--color-ink)]">
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
