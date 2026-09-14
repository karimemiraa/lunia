import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listClients } from "@/modules/crm/clients";
import { listTiers } from "@/modules/iam/tiers";

interface ClientsPageProps {
  searchParams: Promise<{ search?: string; tierKey?: string; source?: string }>;
}

/** ltvCacheMinor is stored in halalas (1/100 SAR). */
function formatSar(minor: number): string {
  const major = minor / 100;
  return `${major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;
}

const CENTER_TZ = "Asia/Riyadh";

function formatLastVisit(date: Date | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, dateStyle: "medium" }).format(date);
}

const inputClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const user = await requireAdmin(PERMISSIONS.CLIENT_VIEW);

  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const tierKey = params.tierKey?.trim() ?? "";
  const source = params.source?.trim() ?? "";

  const [clients, tiers] = await Promise.all([
    listClients({ search: search || undefined, tierKey: tierKey || undefined, source: source || undefined }),
    listTiers(),
  ]);

  const hasFilters = Boolean(search || tierKey || source);

  return (
    <AdminShell user={user} title="Clients" description="Search the client roster, filter by tier or source, and open a profile.">
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3" data-testid="clients-filter-form">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Search</span>
          <input
            type="search"
            name="search"
            defaultValue={search}
            placeholder="Name or phone"
            className={`${inputClass} w-56`}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Tier</span>
          <select name="tierKey" defaultValue={tierKey} className={inputClass}>
            <option value="">All tiers</option>
            {tiers.map((tier) => (
              <option key={tier.id} value={tier.key}>
                {tier.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Source</span>
          <input type="text" name="source" defaultValue={source} placeholder="e.g. instagram" className={`${inputClass} w-40`} />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="lunia-btn lunia-btn-primary"
          >
            Filter
          </button>
          {hasFilters && (
            <Link
              href="/admin/clients"
              className="lunia-btn lunia-btn-ghost"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      <div className="overflow-x-auto lunia-card">
        <table className="w-full text-left text-sm" data-testid="clients-table">
          <thead className="bg-[var(--color-cream)]/60">
            <tr>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Name</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Phone</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Tier</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Source</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">LTV</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Last visit</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Bookings</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[var(--color-ink)]/60">
                  No clients match these filters.
                </td>
              </tr>
            ) : (
              clients.map((client) => (
                <tr
                  key={client.clientProfileId}
                  className="border-t border-[var(--color-ink)]/10"
                  data-testid="client-row"
                  data-client-id={client.clientProfileId}
                >
                  <td className="px-4 py-2 text-[var(--color-ink)]">
                    <Link href={`/admin/clients/${client.clientProfileId}`} className="font-medium text-[var(--color-teal)] hover:underline">
                      {client.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-[var(--color-ink)]">{client.phone ?? "—"}</td>
                  <td className="px-4 py-2 text-[var(--color-ink)]">{client.tierName ?? "—"}</td>
                  <td className="px-4 py-2 text-[var(--color-ink)]">{client.source ?? "—"}</td>
                  <td className="px-4 py-2 text-[var(--color-ink)]">{formatSar(client.ltvMinor)}</td>
                  <td className="px-4 py-2 text-[var(--color-ink)]">{formatLastVisit(client.lastVisitAt)}</td>
                  <td className="px-4 py-2 text-[var(--color-ink)]">{client.bookingCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
