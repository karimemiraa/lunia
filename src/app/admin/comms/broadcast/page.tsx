import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listAudiences, listRecentBroadcasts } from "@/modules/comms/broadcast";
import { BroadcastComposer } from "./BroadcastComposer";
import { audienceDisplay } from "./audienceLabel";
import { getStaffLocale, getStaffT } from "../../_i18n/display";
import { intlLocale, type StaffLocale } from "../../_i18n/t";

const CHANNEL_LABELS: Record<string, string> = { email: "Email", whatsapp: "WhatsApp", sms: "SMS" };

function formatDate(d: Date, locale: StaffLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Asia/Riyadh", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d);
}

export default async function BroadcastPage() {
  const user = await requireAdmin(PERMISSIONS.MARKETING_MANAGE);
  const [audiences, recent] = await Promise.all([listAudiences(), listRecentBroadcasts()]);
  const t = await getStaffT();
  const locale = await getStaffLocale();

  return (
    <AdminShell
      user={user}
      title="Broadcast"
      description="Send an announcement or campaign to a segment of your customers by email, WhatsApp, or SMS — and preview it exactly as they'll receive it."
    >
      <div className="flex flex-col gap-8">
        <div className="lunia-card p-6">
          <BroadcastComposer audiences={audiences} />
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]/50">{t("Recent broadcasts")}</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-[var(--color-ink)]/55">{t("No broadcasts sent yet.")}</p>
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-cream)]/60 text-start text-xs uppercase tracking-wide text-[var(--color-ink)]/55">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">{t("Sent")}</th>
                    <th className="px-4 py-2.5 font-medium">{t("Channel")}</th>
                    <th className="px-4 py-2.5 font-medium">{t("Audience")}</th>
                    <th className="px-4 py-2.5 font-medium">{t("Subject / message")}</th>
                    <th className="px-4 py-2.5 font-medium">{t("Delivered")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {recent.map((b) => (
                    <tr key={b.id} className="bg-[var(--surface)]">
                      <td className="whitespace-nowrap px-4 py-2.5 text-[var(--color-ink)]/70">{formatDate(b.createdAt, locale)}</td>
                      <td className="px-4 py-2.5">{t(CHANNEL_LABELS[b.channel] ?? b.channel)}</td>
                      <td className="px-4 py-2.5">{audienceDisplay(b.audienceLabel, t)}</td>
                      <td className="max-w-xs truncate px-4 py-2.5 text-[var(--color-ink)]/80">{b.subject ?? b.body}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[var(--color-ink)]/70">
                        <span dir="ltr">{b.sentCount}/{b.recipientCount}</span>
                        {b.failedCount > 0 ? ` · ${t("{count} failed", { count: b.failedCount })}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
