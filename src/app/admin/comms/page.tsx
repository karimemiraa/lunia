import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { CommsLogTable } from "./CommsLogTable";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getCommsConfig, type CommsProvider } from "@/modules/comms/config";
import { listCommunicationLog, COMMUNICATION_LOG_STATUSES } from "@/modules/comms/log";
import { KIND_VALUES } from "@/modules/comms/templates";
import { KIND_META } from "@/modules/comms/templateCatalog";
import { getStaffLocale, getStaffT } from "../_i18n/display";
import type { T } from "../_i18n/t";

interface CommsPageProps {
  searchParams: Promise<{ kind?: string; status?: string; page?: string }>;
}

const PAGE_SIZE = 50;

const PROVIDER_LABELS: Record<CommsProvider, string> = {
  none: "None",
  meta_whatsapp: "Meta WhatsApp Cloud API",
  twilio: "Twilio",
  unifonic: "Unifonic",
};

function isKind(value: string): boolean {
  return (KIND_VALUES as readonly string[]).includes(value);
}

function isStatus(value: string): boolean {
  return (COMMUNICATION_LOG_STATUSES as readonly string[]).includes(value);
}

const inputClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";
const sectionClass = "flex flex-col gap-4 lunia-card p-5";

// A "which credential is present" boolean row. Values are NEVER rendered —
// only whether the underlying env var resolved to a non-empty string, per
// getCommsConfig()'s contract that secrets never leave that module.
function CredentialRow({ label, present, t }: { label: string; present: boolean; t: T }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-[var(--color-ink)]/70">{t(label)}</span>
      <span className={`font-medium ${present ? "text-[var(--color-teal)]" : "text-[var(--color-ink)]/50"}`}>
        {present ? t("Yes") : t("No")}
      </span>
    </div>
  );
}

export default async function CommsPage({ searchParams }: CommsPageProps) {
  const user = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  const params = await searchParams;
  const t = await getStaffT();
  const locale = await getStaffLocale();
  const STATUS_LABELS: Record<string, string> = { SENT: "Sent", FAILED: "Failed" };

  const kind = params.kind && isKind(params.kind) ? params.kind : undefined;
  const status = params.status && isStatus(params.status) ? params.status : undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const config = getCommsConfig();
  const { rows, total } = await listCommunicationLog({ kind, status, limit: PAGE_SIZE, offset });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(target: number): string {
    const qs = new URLSearchParams();
    if (kind) qs.set("kind", kind);
    if (status) qs.set("status", status);
    qs.set("page", String(target));
    return `/admin/comms?${qs.toString()}`;
  }

  return (
    <AdminShell
      user={user}
      title="Communications"
      description="Provider status and the log of every WhatsApp/SMS message sent by Lunia."
      actions={
        <Link
          href="/admin/comms/templates"
          className="lunia-btn lunia-btn-ghost"
        >
          {t("Message templates")}
        </Link>
      }
    >
      <div className="flex flex-col gap-8">
        <section className={sectionClass} data-testid="comms-provider-status">
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Provider status")}</h2>
          {config.provider === "none" ? (
            <p className="text-sm text-[var(--color-ink)]/70" data-testid="comms-provider-none">
              {t("No provider configured. Messages are logged only (dev/stub).")}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-[var(--color-ink)]/70">{t("Provider")}</span>
                <span className="font-medium text-[var(--color-ink)]" data-testid="comms-provider-name">
                  {PROVIDER_LABELS[config.provider]}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-[var(--color-ink)]/70">{t("Configured")}</span>
                <span
                  className={`font-medium ${config.configured ? "text-[var(--color-teal)]" : "text-red-600"}`}
                  data-testid="comms-provider-configured"
                >
                  {config.configured ? t("Yes") : t("No")}
                </span>
              </div>
              {config.provider === "meta_whatsapp" && (
                <>
                  <CredentialRow label="Access token present" t={t} present={!!config.meta?.token} />
                  <CredentialRow label="Phone number ID present" t={t} present={!!config.meta?.phoneId} />
                </>
              )}
              {config.provider === "twilio" && (
                <>
                  <CredentialRow label="Account SID present" t={t} present={!!config.twilio?.accountSid} />
                  <CredentialRow label="Auth token present" t={t} present={!!config.twilio?.authToken} />
                  <CredentialRow label="From number present" t={t} present={!!config.twilio?.from} />
                </>
              )}
              {config.provider === "unifonic" && (
                <>
                  <CredentialRow label="App SID present" t={t} present={!!config.unifonic?.appSid} />
                  <CredentialRow label="Sender ID present" t={t} present={!!config.unifonic?.senderId} />
                </>
              )}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4" data-testid="comms-log-section">
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Communication log")}</h2>

          <form method="get" className="flex flex-wrap items-end gap-3" data-testid="comms-log-filter-form">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-[var(--color-ink)]">{t("Kind")}</span>
              <select name="kind" defaultValue={kind ?? ""} className={inputClass}>
                <option value="">{t("All kinds")}</option>
                {KIND_VALUES.map((k) => (
                  <option key={k} value={k}>
                    {locale === "ar" ? t(KIND_META[k]?.label ?? k) : k}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-[var(--color-ink)]">{t("Status")}</span>
              <select name="status" defaultValue={status ?? ""} className={inputClass}>
                <option value="">{t("All statuses")}</option>
                {COMMUNICATION_LOG_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {locale === "ar" ? t(STATUS_LABELS[s] ?? s) : s}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit" className="lunia-btn lunia-btn-primary">
              {t("Filter")}
            </button>
          </form>

          <p className="text-sm text-[var(--color-ink)]/60" data-testid="comms-log-row-count">
            {total === 1 ? t("1 message") : t("{count} messages", { count: total })}
          </p>

          <div data-testid="comms-log-table">
            <CommsLogTable rows={rows} />
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-3 text-sm" data-testid="comms-log-pagination">
              {page > 1 ? (
                <a href={pageHref(page - 1)} className="text-[var(--color-teal)] hover:underline">
                  {t("Previous")}
                </a>
              ) : (
                <span className="text-[var(--color-ink)]/30">{t("Previous")}</span>
              )}
              <span className="text-[var(--color-ink)]/70">
                {t("Page {page} of {pageCount}", { page, pageCount: totalPages })}
              </span>
              {page < totalPages ? (
                <a href={pageHref(page + 1)} className="text-[var(--color-teal)] hover:underline">
                  {t("Next")}
                </a>
              ) : (
                <span className="text-[var(--color-ink)]/30">{t("Next")}</span>
              )}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
