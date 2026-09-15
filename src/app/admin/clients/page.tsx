import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listClients, listClientTags, type ClientLifecycle } from "@/modules/crm/clients";
import { listSegments, segmentToQuery } from "@/modules/crm/segments";
import { saveSegmentAction, deleteSegmentAction } from "./actions";
import { listTiers } from "@/modules/iam/tiers";

interface ClientsPageProps {
  searchParams: Promise<{ search?: string; tierKey?: string; source?: string; status?: string; tag?: string }>;
}

/** ltvCacheMinor is stored in halalas (1/100 SAR). */
function formatSar(minor: number): string {
  const major = minor / 100;
  return `${major.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} SAR`;
}

const CENTER_TZ = "Asia/Riyadh";
const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, day: "numeric", month: "short", year: "numeric" });
function formatDate(date: Date | undefined): string {
  return date ? dateFmt.format(date) : "None";
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
  const tag = params.tag?.trim() ?? "";

  const canManage = user.permissions.has(PERMISSIONS.CLIENT_MANAGE);
  const [allMatching, tiers, allTags, segments] = await Promise.all([
    listClients({ search: search || undefined, tierKey: tierKey || undefined, source: source || undefined, tag: tag || undefined }),
    listTiers(),
    listClientTags(),
    listSegments(),
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
  const hasFilters = Boolean(search || tierKey || source || status || tag);

  return (
    <AdminShell
      user={user}
      title="Customers"
      description="The customer roster: lifetime value, visit history, upcoming appointments, and lifecycle at a glance."
    >
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total customers" value={stats.total} />
        <StatCard label="New this month" value={stats.newThisMonth} />
        <StatCard label="Active" value={stats.active} hint={`visited in last 90 days`} />
        <StatCard label="Lapsed" value={stats.lapsed} hint="due for re-engagement" />
      </div>

      {(segments.length > 0 || (canManage && hasFilters)) && (
        <div className="mb-5 flex flex-wrap items-center gap-2" data-testid="segments-bar">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/45">Segments</span>
          {segments.map((seg) => (
            <span key={seg.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--color-ink)]/[0.06] py-1 pe-1.5 ps-3 text-sm">
              <Link
                href={`/admin/clients${segmentToQuery(seg.filter)}`}
                className="text-[var(--color-ink)]/80 hover:text-[var(--color-teal-ink)]"
              >
                {seg.name}
              </Link>
              {canManage && (
                <form action={deleteSegmentAction}>
                  <input type="hidden" name="segmentId" value={seg.id} />
                  <button
                    type="submit"
                    aria-label={`Delete segment ${seg.name}`}
                    className="flex h-4 w-4 items-center justify-center rounded-full text-xs leading-none text-[var(--color-ink)]/40 hover:bg-red-100 hover:text-red-600"
                  >
                    ×
                  </button>
                </form>
              )}
            </span>
          ))}
          {canManage && hasFilters && (
            <form action={saveSegmentAction} className="inline-flex items-center gap-1.5">
              <input type="hidden" name="search" value={search} />
              <input type="hidden" name="tierKey" value={tierKey} />
              <input type="hidden" name="source" value={source} />
              <input type="hidden" name="status" value={status} />
              <input type="hidden" name="tag" value={tag} />
              <input
                name="name"
                required
                placeholder="Name this view…"
                className="rounded-full border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1 text-sm focus:border-[var(--color-teal)] focus:outline-none"
              />
              <button type="submit" className="lunia-btn lunia-btn-ghost lunia-btn-sm">
                Save segment
              </button>
            </form>
          )}
        </div>
      )}

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

        {allTags.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60">Tag</span>
            <select name="tag" defaultValue={tag} className={inputClass}>
              <option value="">All tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}

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
        Showing {clients.length} {clients.length === 1 ? "customer" : "customers"}
        {hasFilters ? " (filtered)" : ""}.
      </p>

      <div className="overflow-x-auto lunia-card">
        <table className="w-full text-left text-sm" data-testid="clients-table">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
              <th className="px-4 py-3 font-semibold">Customer</th>
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
                      {client.fullName || "Unnamed customer"}
                    </Link>
                    <div className="text-xs text-[var(--color-ink)]/50">{client.phone ?? client.email ?? "None"}</div>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-ink)]/80">{client.tierName ?? "None"}</td>
                  <td className="px-4 py-3 text-[var(--color-ink)]/70">{client.source ?? "None"}</td>
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
