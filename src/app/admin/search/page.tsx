import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { EmptyState } from "../_components/EmptyState";
import { StatusPill } from "../_components/StatusPill";
import {
  globalSearch,
  emptySearchResult,
  searchTotal,
  SEARCH_GROUPS,
  SEARCH_GROUP_LABELS,
  SEARCH_GROUP_PERMISSION,
  type SearchHit,
  type SearchGroupKey,
} from "@/modules/search/globalSearch";

interface SearchPageProps {
  searchParams: Promise<{ q?: string; in?: string }>;
}

const GROUP_ICON: Record<SearchGroupKey, string> = {
  customers: "M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11ZM3.5 20a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.5M20.5 20a4.8 4.8 0 0 0-3-4.4",
  bookings: "M3.5 9h17M8 3v4M16 3v4M3.5 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z",
  invoices: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  products: "m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9",
  employees: "M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11ZM3.5 20a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.5M20.5 20a4.8 4.8 0 0 0-3-4.4",
  inquiries: "M4 13 6 5h12l2 8v6H4zM4 13h4a2 2 0 0 0 4 0h0a2 2 0 0 0 4 0h4",
  conversations: "M4 5h16v11H9l-5 4V5ZM8 9h8M8 12.5h5",
  chats: "M4 5h16v11H9l-5 4zM8 9.5h8M8 12.5h5",
  callbacks: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z",
};

function ResultGroup({ group, hits }: { group: SearchGroupKey; hits: SearchHit[] }) {
  if (hits.length === 0) return null;
  return (
    <section id={group} className="flex flex-col gap-2" aria-labelledby={`h-${group}`}>
      <h2 id={`h-${group}`} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]/55">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
          <path d={GROUP_ICON[group]} />
        </svg>
        {SEARCH_GROUP_LABELS[group]} <span className="lunia-tabular font-normal text-[var(--color-ink)]/40">({hits.length})</span>
      </h2>
      <ul className="flex flex-col gap-2">
        {hits.map((h) => (
          <li key={h.id}>
            <Link
              href={h.href}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 transition-colors hover:border-[var(--color-teal)] hover:bg-[var(--color-teal)]/[0.08] focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-[var(--color-ink)]">{h.title}</span>
                {h.subtitle && <span className="block truncate text-xs text-[var(--color-ink)]/55">{h.subtitle}</span>}
              </span>
              {h.badge && <StatusPill status={h.badge} className="shrink-0">{h.badge}</StatusPill>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const user = await requireAdmin();
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 80);
  const only = SEARCH_GROUPS.includes(params.in as SearchGroupKey) ? (params.in as SearchGroupKey) : undefined;
  const results = query.length >= 2 ? await globalSearch(query, user.permissions) : emptySearchResult();
  const total = searchTotal(results);
  const searchable = SEARCH_GROUPS.filter((g) => user.permissions.has(SEARCH_GROUP_PERMISSION[g]));
  const nonEmpty = SEARCH_GROUPS.filter((g) => results[g].length > 0);
  const shown = only ? nonEmpty.filter((g) => g === only) : nonEmpty;

  return (
    <AdminShell user={user} title="Search" description={`Across ${searchable.map((g) => SEARCH_GROUP_LABELS[g].toLowerCase()).join(", ")}.`}>
      <form method="get" role="search" className="mb-6 flex flex-col gap-2 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">Search query</span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            autoFocus
            placeholder="Name, phone, invoice number, SKU, barcode…"
            className="lunia-input"
            minLength={2}
          />
        </label>
        <button type="submit" className="lunia-btn lunia-btn-forest">Search</button>
      </form>

      {query.length < 2 ? (
        <div className="lunia-card">
          <EmptyState
            title="What are you looking for?"
            body="Type at least 2 characters. Tip: press / anywhere to open the quick search."
            icon={<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>}
          />
        </div>
      ) : total === 0 ? (
        <div className="lunia-card">
          <EmptyState
            title={`No results for “${query}”`}
            body="Try fewer words, the last digits of a phone number, an invoice number like INV-2026-000123, or a product SKU."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {user.permissions.has(SEARCH_GROUP_PERMISSION.customers) && (
                  <Link href={`/admin/clients?search=${encodeURIComponent(query)}`} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm">Search customers list</Link>
                )}
                {user.permissions.has(SEARCH_GROUP_PERMISSION.invoices) && (
                  <Link href={`/admin/billing?q=${encodeURIComponent(query)}`} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm">Search invoices</Link>
                )}
                <Link href="/admin" className="lunia-btn lunia-btn-ghost lunia-btn-sm">Back to dashboard</Link>
              </div>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[var(--color-ink)]/55">
              <span className="lunia-tabular font-semibold text-[var(--color-ink)]">{total}</span> result{total === 1 ? "" : "s"} in
            </span>
            <Link href={`/admin/search?q=${encodeURIComponent(query)}`} className={`lunia-pill ${!only ? "" : "opacity-70"}`} data-tone={!only ? "info" : "neutral"} aria-current={!only ? "page" : undefined}>
              All
            </Link>
            {nonEmpty.map((g) => (
              <Link
                key={g}
                href={`/admin/search?q=${encodeURIComponent(query)}&in=${g}`}
                className={`lunia-pill ${only === g ? "" : "opacity-70"}`}
                data-tone={only === g ? "info" : "neutral"}
                aria-current={only === g ? "page" : undefined}
              >
                {SEARCH_GROUP_LABELS[g]} {results[g].length}
              </Link>
            ))}
          </div>
          {shown.map((g) => (
            <ResultGroup key={g} group={g} hits={results[g]} />
          ))}
        </div>
      )}
    </AdminShell>
  );
}
