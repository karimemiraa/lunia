import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { StatusPill } from "../_components/StatusPill";
import { EmptyState } from "../_components/EmptyState";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listEditRequests, EDIT_REQUEST_STATUSES, type EditRequestStatus } from "@/modules/editRequests/editRequests";
import { RequestStatusForm } from "./RequestStatusForm";
import { getStaffLocale, getStaffT } from "../_i18n/display";
import { intlLocale } from "../_i18n/t";
import { translateStatus } from "../_ui/labels";

interface RequestsPageProps {
  searchParams: Promise<{ status?: string }>;
}

const FILTERS: { value: string; label: string }[] = [
  { value: "active", label: "Open & in progress" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
  { value: "DECLINED", label: "Declined" },
  { value: "all", label: "All" },
];

const PRIORITY_TONE = { HIGH: "danger", NORMAL: "info", LOW: "neutral" } as const;

// Edit requests filed by the team from the Ask Lunia assistant ("please change X").
// Owners triage them here and can leave a reply the requester sees in the assistant.
export default async function RequestsPage({ searchParams }: RequestsPageProps) {
  const user = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  const [t, locale] = await Promise.all([getStaffT(), getStaffLocale()]);
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Asia/Riyadh", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const params = await searchParams;
  const filter = FILTERS.some((f) => f.value === params.status) ? params.status! : "active";
  const all = await listEditRequests(
    (EDIT_REQUEST_STATUSES as readonly string[]).includes(filter) ? { status: filter as EditRequestStatus } : {},
  );
  const rows = filter === "active" ? all.filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS") : all;

  return (
    <AdminShell user={user} title="Edit requests" description="Changes the team asked for from the Ask Lunia assistant. Update the status and leave a reply — the requester sees it when they ask “my requests”.">
      <nav className="mb-5 flex flex-wrap gap-2" aria-label={t("Filter requests")}>
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "active" ? "/admin/requests" : `/admin/requests?status=${f.value}`}
            aria-current={f.value === filter ? "page" : undefined}
            className={`lunia-btn lunia-btn-sm ${f.value === filter ? "lunia-btn-forest" : "lunia-btn-ghost"}`}
          >
            {translateStatus(f.label, t)}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="lunia-card">
          <EmptyState title={t("No requests here")} body={t("When someone uses “Request an edit” in Ask Lunia, it shows up in this list.")} />
        </div>
      ) : (
        <ul className="flex flex-col gap-4" data-testid="edit-requests-list">
          {rows.map((r) => (
            <li key={r.id} className="lunia-card flex flex-col gap-3 p-5" data-testid="edit-request-row">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-[var(--color-ink)]">{r.title}</h2>
                  <p className="mt-0.5 text-xs text-[var(--color-ink)]/60">
                    {r.createdByName} · <span className="tabular-nums">{fmt.format(r.createdAt)}</span>
                    {r.pagePath && (
                      <>
                        {` · ${t("from")} `}
                        <Link href={r.pagePath} className="underline underline-offset-2">
                          {r.pagePath}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <StatusPill tone={PRIORITY_TONE[r.priority as keyof typeof PRIORITY_TONE] ?? "neutral"}>{t(`${r.priority.charAt(0) + r.priority.slice(1).toLowerCase()} priority`)}</StatusPill>
                  <StatusPill status={r.status} />
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm text-[var(--color-ink)]/85">{r.details}</p>
              <RequestStatusForm id={r.id} status={r.status} note={r.resolutionNote} />
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
