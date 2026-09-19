import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listAudiences, listRecentBroadcasts } from "@/modules/comms/broadcast";
import { BroadcastComposer } from "./BroadcastComposer";

const CHANNEL_LABELS: Record<string, string> = { email: "Email", whatsapp: "WhatsApp", sms: "SMS" };

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d);
}

export default async function BroadcastPage() {
  const user = await requireAdmin(PERMISSIONS.MARKETING_MANAGE);
  const [audiences, recent] = await Promise.all([listAudiences(), listRecentBroadcasts()]);

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
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]/50">Recent broadcasts</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-[var(--color-ink)]/55">No broadcasts sent yet.</p>
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-cream)]/60 text-left text-xs uppercase tracking-wide text-[var(--color-ink)]/55">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Sent</th>
                    <th className="px-4 py-2.5 font-medium">Channel</th>
                    <th className="px-4 py-2.5 font-medium">Audience</th>
                    <th className="px-4 py-2.5 font-medium">Subject / message</th>
                    <th className="px-4 py-2.5 font-medium">Delivered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {recent.map((b) => (
                    <tr key={b.id} className="bg-[var(--surface)]">
                      <td className="whitespace-nowrap px-4 py-2.5 text-[var(--color-ink)]/70">{formatDate(b.createdAt)}</td>
                      <td className="px-4 py-2.5">{CHANNEL_LABELS[b.channel] ?? b.channel}</td>
                      <td className="px-4 py-2.5">{b.audienceLabel}</td>
                      <td className="max-w-xs truncate px-4 py-2.5 text-[var(--color-ink)]/80">{b.subject ?? b.body}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[var(--color-ink)]/70">
                        {b.sentCount}/{b.recipientCount}
                        {b.failedCount > 0 ? ` · ${b.failedCount} failed` : ""}
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
