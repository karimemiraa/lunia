import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { globalSearch, type SearchHit } from "@/modules/search/globalSearch";

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

function ResultGroup({ title, hits }: { title: string; hits: SearchHit[] }) {
  if (hits.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]/50">
        {title} ({hits.length})
      </h2>
      <ul className="flex flex-col gap-2">
        {hits.map((h) => (
          <li key={h.id}>
            <Link href={h.href} className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 transition-colors hover:border-[var(--color-teal)] hover:bg-[var(--color-teal)]/[0.05]">
              <span className="min-w-0">
                <span className="block truncate font-medium text-[var(--color-ink)]">{h.title}</span>
                {h.subtitle && <span className="block truncate text-xs text-[var(--color-ink)]/55">{h.subtitle}</span>}
              </span>
              {h.badge && <span className="shrink-0 rounded-full bg-[var(--color-ink)]/[0.06] px-2.5 py-0.5 text-xs text-[var(--color-ink)]/60">{h.badge}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const user = await requireAdmin(PERMISSIONS.CLIENT_VIEW);
  const { q = "" } = await searchParams;
  const query = q.trim();
  const results = query.length >= 2 ? await globalSearch(query) : { customers: [], inquiries: [], conversations: [] };
  const total = results.customers.length + results.inquiries.length + results.conversations.length;

  return (
    <AdminShell user={user} title="Search" description="Search across customers, inquiries, and WhatsApp conversations.">
      <form method="get" className="mb-6 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          autoFocus
          placeholder="Name, phone, email, message…"
          className="lunia-input max-w-md"
        />
        <button type="submit" className="lunia-btn lunia-btn-forest">Search</button>
      </form>

      {query.length < 2 ? (
        <p className="text-sm text-[var(--color-ink)]/55">Type at least 2 characters to search.</p>
      ) : total === 0 ? (
        <p className="text-sm text-[var(--color-ink)]/55">No results for “{query}”.</p>
      ) : (
        <div className="flex flex-col gap-6">
          <ResultGroup title="Customers" hits={results.customers} />
          <ResultGroup title="Inquiries" hits={results.inquiries} />
          <ResultGroup title="WhatsApp" hits={results.conversations} />
        </div>
      )}
    </AdminShell>
  );
}
