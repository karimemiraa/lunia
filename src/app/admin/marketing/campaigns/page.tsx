import Link from "next/link";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listCampaignSpend } from "@/modules/crm/campaigns";
import { CampaignSpendForm } from "./CampaignSpendForm";

/** amountMinor is stored in halalas (1/100 SAR). */
function formatSar(minor: number): string {
  const major = minor / 100;
  return `${major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;
}

export default async function CampaignSpendPage() {
  const user = await requireAdmin(PERMISSIONS.MARKETING_MANAGE);

  // A generous 3-calendar-year window (last year through next year) so any
  // recently-added month is visible without needing a date-range picker.
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear() + 1, 11, 1));
  const spend = await listCampaignSpend({ from, to });

  return (
    <AdminShell
      user={user}
      title="Campaign Spend"
      description="Record monthly ad spend per channel, used to compute cost-per-acquisition on the Marketing dashboard."
      actions={
        <Link href="/admin/marketing" className="text-sm font-medium text-[var(--color-teal)] hover:underline">
          Back to Marketing dashboard
        </Link>
      }
    >
      <div className="mb-8 max-w-3xl">
        <CampaignSpendForm />
      </div>

      <div className="overflow-x-auto rounded border border-[var(--color-ink)]/10">
        <table className="w-full text-left text-sm" data-testid="campaign-spend-table">
          <thead className="bg-[var(--color-cream)]/60">
            <tr>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Channel</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Period</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Amount</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Note</th>
            </tr>
          </thead>
          <tbody>
            {spend.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[var(--color-ink)]/60">
                  No campaign spend recorded yet.
                </td>
              </tr>
            ) : (
              spend.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-[var(--color-ink)]/10"
                  data-testid="campaign-spend-row"
                  data-channel={row.channel}
                  data-period={row.periodMonth}
                >
                  <td className="px-4 py-2 text-[var(--color-ink)]">{row.channel}</td>
                  <td className="px-4 py-2 text-[var(--color-ink)]">{row.periodMonth}</td>
                  <td className="px-4 py-2 text-[var(--color-ink)]">{formatSar(row.amountMinor)}</td>
                  <td className="px-4 py-2 text-[var(--color-ink)]/70">{row.note ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
