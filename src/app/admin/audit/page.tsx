import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listAuditLogs } from "@/modules/iam/audit";
import { getStaffLocale, getStaffT } from "../_i18n/display";
import { translateIn } from "../_i18n/t";
import { intlLocale } from "../_i18n/t";

interface AuditPageProps {
  searchParams: Promise<{ search?: string }>;
}

const inputClass = "rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm";

export default async function AuditPage({ searchParams }: AuditPageProps) {
  // Gated on SETTINGS_MANAGE — effectively owner-only in the seeded role map.
  const user = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  const [t, locale] = await Promise.all([getStaffT(), getStaffLocale()]);
  // Riyadh-local formatting so timestamps read in the center's own timezone.
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const rows = await listAuditLogs({ limit: 200, search: search || undefined });

  return (
    <AdminShell
      user={user}
      title="Audit Log"
      description="A record of sensitive administrative changes (roles, tiers, settings). Newest first."
    >
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3" data-testid="audit-filter-form">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">{t("Search")}</span>
          <input
            type="search"
            name="search"
            defaultValue={search}
            placeholder={t("Action, entity, or summary")}
            className={`${inputClass} w-64`}
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="lunia-btn lunia-btn-primary"
          >
            {t("Filter")}
          </button>
          {search && (
            <Link
              href="/admin/audit"
              className="lunia-btn lunia-btn-ghost"
            >
              {t("Clear")}
            </Link>
          )}
        </div>
      </form>

      <div className="overflow-x-auto lunia-card">
        <table className="w-full text-start text-sm" data-testid="audit-table">
          <thead className="bg-[var(--color-cream)]/60">
            <tr>
              <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">{t("When")}</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">{t("Actor")}</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">{t("Action")}</th>
              <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">{t("Entity")}</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Summary")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[var(--color-ink)]/60">
                  {t(search ? "No audit entries match this search." : "No audit entries yet.")}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--color-ink)]/10">
                  <td className="whitespace-nowrap px-4 py-2 text-[var(--color-ink)]/80">{fmt.format(row.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-[var(--color-ink)]/80" title={row.actorUserId}>{row.actorName}</td>
                  <td className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">{row.action}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-[var(--color-ink)]/80">
                    {translateIn(row.entityType, "record", locale)}
                    {row.entityId ? ` (${row.entityId})` : ""}
                  </td>
                  <td className="px-4 py-2 text-[var(--color-ink)]/80" data-i18n-ignore="" lang={locale === "ar" ? "en" : undefined}>{row.summary}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
