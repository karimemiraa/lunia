import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listChatSessions, OUTCOME_FILTERS, type OutcomeFilter } from "@/modules/assistant/admin";
import { displayPhone } from "@/modules/assistant/phone";
import { FilterChips, StatusPill, formatDateTime } from "./_ui";
import { getStaffLocale } from "../_i18n/display";
import { makeT } from "../_i18n/t";
import { CONCERN_LABELS } from "@/modules/assistant/copy";

// Concerns arrive as their English labels; Arabic mode shows the Arabic label.
const CONCERN_AR = new Map(Object.values(CONCERN_LABELS).map((p) => [p.en, p.ar]));

interface AssistantPageProps {
  searchParams: Promise<{ outcome?: string; page?: string }>;
}

const PAGE_SIZE = 50;

function isOutcome(v: string | undefined): v is OutcomeFilter {
  return !!v && (OUTCOME_FILTERS as readonly string[]).includes(v);
}

export default async function AssistantSessionsPage({ searchParams }: AssistantPageProps) {
  const user = await requireAdmin(PERMISSIONS.CLIENT_VIEW);
  const locale = await getStaffLocale();
  const t = makeT(locale);
  const concerns = (list: string[]) => (locale === "ar" ? list.map((c) => CONCERN_AR.get(c) ?? c).join("، ") : list.join(", "));
  const params = await searchParams;
  const outcome = isOutcome(params.outcome) ? params.outcome : undefined;
  const page = Math.max(1, Number(params.page) || 1);
  const { rows, total } = await listChatSessions({ outcome, page, pageSize: PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => `/admin/assistant?${new URLSearchParams({ ...(outcome ? { outcome } : {}), page: String(p) })}`;

  return (
    <AdminShell
      user={user}
      title="Chat assistant"
      description="Every website consultation: what visitors asked about, what the assistant suggested, and how it ended."
    >
      <FilterChips base="/admin/assistant" param="outcome" values={OUTCOME_FILTERS} active={outcome} filterLabel={t("Filter")} />

      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-[var(--color-ink)]/20 px-4 py-8 text-center text-sm text-[var(--color-ink)]/60">
          {t("No conversations yet.")}
        </p>
      ) : (
        <>
          {/* Cards on phones / narrow iPads, a table from lg up. */}
          <ul className="flex flex-col gap-3 lg:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/assistant/${r.id}`} className="lunia-card block p-4 transition-shadow hover:shadow-[var(--shadow-md)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--color-ink)]">{r.name || t("Anonymous visitor")}</p>
                      <p className="text-xs text-[var(--color-ink)]/60">
                        {r.phone ? <span dir="ltr">{displayPhone(r.phone)}</span> : t("No phone")} · {formatDateTime(r.createdAt, locale)}
                      </p>
                    </div>
                    <StatusPill value={r.outcome} />
                  </div>
                  {r.concerns.length > 0 && <p className="mt-2 text-sm text-[var(--color-ink)]/80">{concerns(r.concerns)}</p>}
                  {r.recommended.length > 0 && <p className="mt-1 text-xs text-[var(--color-teal-ink)]">{t("Suggested: {services}", { services: r.recommended.join(", ") })}</p>}
                </Link>
              </li>
            ))}
          </ul>

          <div className="lunia-card hidden overflow-x-auto lg:block">
            <table className="w-full text-start text-sm">
              <thead className="bg-[var(--color-cream)]/60">
                <tr>
                  {["Started", "Visitor", "Concerns", "Suggested", "Outcome", ""].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">
                      {h ? t(h) : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--color-ink)]/10 align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--color-ink)]/70">
                      {formatDateTime(r.createdAt, locale)}
                      <span className="block text-[var(--color-ink)]/45">{r.locale.toUpperCase()} · {t("{count} msgs", { count: r.messageCount })}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block text-[var(--color-ink)]">{r.name || t("Anonymous")}</span>
                      {r.phone && <span className="text-xs text-[var(--color-ink)]/60" dir="ltr">{displayPhone(r.phone)}</span>}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink)]/80">{concerns(r.concerns) || "—"}</td>
                    <td className="px-4 py-3 text-xs text-[var(--color-ink)]/70">{r.recommended.join(", ") || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusPill value={r.outcome} />
                    </td>
                    <td className="px-4 py-3 text-end">
                      <Link href={`/admin/assistant/${r.id}`} className="lunia-btn lunia-btn-ghost lunia-btn-sm">
                        {t("Open")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav aria-label={t("Pages")} className="mt-6 flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="lunia-btn lunia-btn-ghost lunia-btn-sm">
                  {t("Newer")}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-[var(--color-ink)]/60">
                {t("Page {page} of {pageCount}", { page, pageCount: pages })} · {t("{count} conversations", { count: total })}
              </span>
              {page < pages ? (
                <Link href={pageHref(page + 1)} className="lunia-btn lunia-btn-ghost lunia-btn-sm">
                  {t("Older")}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </AdminShell>
  );
}
