import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listClients, listClientTags, listStaffOwners, applyRosterView, ROSTER_VIEWS, ROSTER_VIEW_LABELS, type ClientLifecycle, type RosterView } from "@/modules/crm/clients";
import { ClientsTable, type ClientRowDTO } from "./ClientsTable";
import { listSegments, segmentToQuery } from "@/modules/crm/segments";
import { saveSegmentAction, deleteSegmentAction } from "./actions";
import { listTiers } from "@/modules/iam/tiers";
import { AddLeadForm } from "./AddLeadForm";
import { listStages } from "@/modules/crm/pipeline";

interface ClientsPageProps {
  searchParams: Promise<{ search?: string; tierKey?: string; source?: string; status?: string; tag?: string; stage?: string; ownerId?: string; direction?: string; view?: string }>;
}

const inputClass =
  "rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none focus:ring-2 focus:ring-[var(--color-teal)]/30";

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
  const stage = params.stage?.trim() ?? "";
  const ownerId = params.ownerId?.trim() ?? "";
  const direction = params.direction?.trim() ?? "";
  const view: RosterView = (ROSTER_VIEWS as readonly string[]).includes(params.view ?? "") ? (params.view as RosterView) : "all";

  const canManage = user.permissions.has(PERMISSIONS.CLIENT_MANAGE);
  const [allMatching, tiers, allTags, segments, owners, stageRows] = await Promise.all([
    listClients({ search: search || undefined, tierKey: tierKey || undefined, source: source || undefined, tag: tag || undefined, stage: stage || undefined, ownerId: ownerId || undefined, direction: direction || undefined }),
    listTiers(),
    listClientTags(),
    listSegments(),
    listStaffOwners(),
    listStages(),
  ]);
  const stageMeta = new Map(stageRows.map((s) => [s.key, s]));

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

  const viewed = applyRosterView(allMatching, view, now);
  const clients = status ? viewed.filter((c) => c.status === status) : viewed;
  const hasFilters = Boolean(search || tierKey || source || status || tag || stage || ownerId || direction);
  const viewCounts = Object.fromEntries(ROSTER_VIEWS.map((v) => [v, applyRosterView(allMatching, v, now).length])) as Record<RosterView, number>;

  // Same query string the page was rendered with, so the CSV export matches the view.
  const filterQs = new URLSearchParams();
  for (const [k, v] of Object.entries({ search, tierKey, source, status, tag, stage, ownerId, direction })) if (v) filterQs.set(k, v);
  const viewHref = (v: RosterView) => {
    const sp = new URLSearchParams(filterQs);
    if (v !== "all") sp.set("view", v);
    const str = sp.toString();
    return str ? `/admin/clients?${str}` : "/admin/clients";
  };
  const exportQs = new URLSearchParams(filterQs);
  if (view !== "all") exportQs.set("view", view);
  const exportHref = `/admin/clients/export${exportQs.toString() ? `?${exportQs.toString()}` : ""}`;

  const rows: ClientRowDTO[] = clients.map((c) => ({
    id: c.clientProfileId,
    fullName: c.fullName,
    phone: c.phone,
    email: c.email,
    stage: c.stage,
    stageLabel: stageMeta.get(c.stage)?.label ?? c.stage,
    stageColor: stageMeta.get(c.stage)?.color ?? "",
    ownerName: c.ownerName ?? null,
    source: c.source ?? null,
    tierName: c.tierName ?? null,
    tags: c.tags,
    ltvMinor: c.ltvMinor,
    owedMinor: c.owedMinor,
    bookingCount: c.bookingCount,
    lastVisitIso: c.lastVisitAt ? c.lastVisitAt.toISOString() : null,
    nextAppointmentIso: c.nextAppointmentAt ? c.nextAppointmentAt.toISOString() : null,
    nextFollowUpIso: c.nextFollowUpAt ? c.nextFollowUpAt.toISOString() : null,
    status: c.status,
  }));

  return (
    <AdminShell
      user={user}
      title="Customers"
      description="The customer roster: lifetime value, visit history, upcoming appointments, and lifecycle at a glance."
      actions={
        <>
          <a href={exportHref} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11" download>
            Export CSV
          </a>
          {canManage && <AddLeadForm staff={owners} />}
        </>
      }
    >
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total customers" value={stats.total} />
        <StatCard label="New this month" value={stats.newThisMonth} />
        <StatCard label="Active" value={stats.active} hint={`visited in last 90 days`} />
        <StatCard label="Lapsed" value={stats.lapsed} hint="due for re-engagement" />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2" data-testid="roster-views" role="group" aria-label="Saved views">
        {ROSTER_VIEWS.map((v) => {
          const active = v === view;
          return (
            <Link
              key={v}
              href={viewHref(v)}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] ${
                active ? "bg-[var(--color-ink)] text-[var(--color-cream)]" : "border border-[var(--line-strong)] text-[var(--color-ink)]/75 hover:bg-[var(--surface-2)]"
              }`}
            >
              {ROSTER_VIEW_LABELS[v]}
              <span className={`rounded-full px-1.5 text-[0.65rem] font-semibold ${active ? "bg-[var(--color-cream)]/20" : "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/55"}`}>{viewCounts[v]}</span>
            </Link>
          );
        })}
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
              <input type="hidden" name="stage" value={stage} />
              <input type="hidden" name="ownerId" value={ownerId} />
              <input type="hidden" name="direction" value={direction} />
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
        {view !== "all" && <input type="hidden" name="view" value={view} />}
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
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60">Stage</span>
          <select name="stage" defaultValue={stage} className={inputClass}>
            <option value="">All stages</option>
            {stageRows.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60">Owner</span>
          <select name="ownerId" defaultValue={ownerId} className={inputClass}>
            <option value="">All owners</option>
            <option value="unassigned">Unassigned</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60">Channel</span>
          <select name="direction" defaultValue={direction} className={inputClass}>
            <option value="">All</option>
            <option value="INBOUND">Inbound</option>
            <option value="OUTBOUND">Outbound</option>
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

      <ClientsTable rows={rows} staff={owners} canManage={canManage} canBroadcast={user.permissions.has(PERMISSIONS.MARKETING_MANAGE)} />
    </AdminShell>
  );
}
