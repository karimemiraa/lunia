import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listClients, type ClientLifecycle } from "@/modules/crm/clients";
import { listTiers } from "@/modules/iam/tiers";

interface ClientsPageProps {
  searchParams: Promise<{ search?: string; tierKey?: string; source?: string; status?: string }>;
}

/** ltvCacheMinor is stored in halalas (1/100 SAR). */
function formatSar(minor: number): string {
  const major = minor / 100;
  return `${major.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} SAR`;
}

const CENTER_TZ = "Asia/Riyadh";
const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, day: "numeric", month: "short", year: "numeric" });
function formatDate(date: Date | undefined): string {
  return date ? dateFmt.format(date) : "—";
}

const inputClass =
  "rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none focus:ring-2 focus:ring-[var(--color-teal)]/30";

const STATUS_META: Record<ClientLifecycle, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-[var(--color-teal)]/20 text-[var(--color-teal-ink)]" },
  new: { label: "New", className: "bg-[var(--color-gold)]/25 text-[#7c6a2f]" },
  lapsed: { label: "Lapsed", className: "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/55" },
};

function StatusBadge({ status }: { status: ClientLifecycle }) {
  const m = STATUS_META[status];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${m.className}`}>{m.label}</span>;
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="lunia-card px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/50">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--color-ink)]">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-[var(--color-ink)]/45">{hint}</p>}
    </div>
  );
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const user = await requireAdmin(PERMISSIONS.CLIENT_VIEW);

  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const tierKey = params.tierKey?.trim() ?? "";
  const source = params.source?.trim() ?? "";
  const status = (params.status?.trim() ?? "") as ClientLifecycle | "";

  const [allMatching, tiers] = await Promise.all([
    listClients({ search: search || undefined, tierKey: tierKey || undefined, source: source || undefined }),
    listTiers(),
  ]);

  // KPIs computed over the search/tier/source result (the whole roster when no
  // filters are set); the status dropdown then narrows the table itself.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const stats = {
    total: allMatching.length,
    newThisMonth: allMatching.filter((c) => c.createdAt >= monthStart).length,
    active: allMatching.filter((c) => c.status === "active").length,
    lapsed: allMatching.filter((c) => c.status === "lapsed").length,
  };

  const clients = status ? allMatching.filter((c) => c.status === status) : allMatching;
  const hasFilters = Boolean(search || tierKey || source || status);

  return (
    <AdminShell
      user={user}
      title="Clients"
      description="The client roster — lifetime value, visit history, upcoming appointments, and lifecycle at a glance."
    >
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total clients" value={stats.total} />
        <StatCard label="New this month" value={stats.newThisMonth} />
        <StatCard label="Active" value={stats.active} hint={`visited in last 90 days`} />
        <StatCard label="Lapsed" value={stats.lapsed} hint="due for re-engagement" />
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3" data-testid="clients-filter-form">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60">Search</span>
          <input type="search" name="search" defaultValue={search} placeholder="Name, phone or email" className={`${inputClass} w-60`} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60">Tier</span>
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
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60">Status</span>
          <select name="status" defaultValue={status} className={inputClass}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="new">New</option>
            <option value="lapsed">Lapsed</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60">Source</span>
          <input type="text" name="source" defaultValue={source} placeholder="e.g. instagram" className={`${inputClass} w-40`} />
        </label>

        <div className="flex gap-2">
          <button type="submit" className="lunia-btn lunia-btn-primary">
            Filter
          </button>
          {hasFilters && (
            <Link href="/admin/clients" className="lunia-btn lunia-btn-ghost">
              Clear
            </Link>
          )}
        </div>
      </form>

      <p className="mb-3 text-sm text-[var(--color-ink)]/55">
        Showing {clients.length} {clients.length === 1 ? "client" : "clients"}
        {hasFilters ? " (filtered)" : ""}.
      </p>

      <div className="overflow-x-auto lunia-card">
        <table className="w-full text-left text-sm" data-testid="clients-table">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
              <th className="px-4 py-3 font-semibold">Client</th>
              <th className="px-4 py-3 font-semibold">Tier</th>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 text-right font-semibold">LTV</th>
              <th className="px-4 py-3 text-right font-semibold">Visits</th>
              <th className="px-4 py-3 font-semibold">Last visit</th>
              <th className="px-4 py-3 font-semibold">Next appt</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-[var(--color-ink)]/55">
                  No clients match these filters.
                </td>
              </tr>
            ) : (
              clients.map((client) => (
                <tr
                  key={client.clientProfileId}
                  className="border-t border-[var(--line)] transition-colors hover:bg-[var(--color-teal)]/[0.06]"
                  data-testid="client-row"
                  data-client-id={client.clientProfileId}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/clients/${client.clientProfileId}`}
                      className="font-medium text-[var(--color-ink)] hover:text-[var(--color-teal-ink)] hover:underline"
                    >
                      {client.fullName || "Unnamed client"}
                    </Link>
                    <div className="text-xs text-[var(--color-ink)]/50">{client.phone ?? client.email ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-ink)]/80">{client.tierName ?? "—"}</td>
                  <td className="px-4 py-3 text-[var(--color-ink)]/70">{client.source ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium text-[var(--color-ink)]">{formatSar(client.ltvMinor)}</td>
                  <td className="px-4 py-3 text-right text-[var(--color-ink)]/80">{client.bookingCount}</td>
                  <td className="px-4 py-3 text-[var(--color-ink)]/70">{formatDate(client.lastVisitAt)}</td>
                  <td className="px-4 py-3 text-[var(--color-ink)]/70">{formatDate(client.nextAppointmentAt)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={client.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
