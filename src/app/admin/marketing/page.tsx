import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { channelPerformance, bestChannels, newVsReturning } from "@/modules/crm/marketing";
import { topClientsByLtv } from "@/modules/crm/ltv";
import { trafficSources, topPages, bookingConversion } from "@/modules/analytics/queries";
import { centerLocalToUtc, utcToCenterLocal } from "@/modules/booking/availability";
import { StatCard } from "@/components/admin/charts/StatCard";
import { BarChart, type BarChartDatum } from "@/components/admin/charts/BarChart";

const TOP_PAGES_LIMIT = 10;
const TOP_CLIENTS_LIMIT = 10;

/** priceMinor / spendMinor / revenueMinor / ltvMinor are stored in halalas (1/100 SAR). */
function formatSar(minor: number): string {
  const major = minor / 100;
  return `${major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;
}

function formatSarOrDash(minor: number | null): string {
  return minor === null ? "—" : formatSar(minor);
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export default async function MarketingDashboardPage() {
  const user = await requireAdmin(PERMISSIONS.ANALYTICS_VIEW);
  const canManageCampaigns = user.permissions.has(PERMISSIONS.MARKETING_MANAGE);

  // Current center-local month, month-to-date: [start of this month, start of tomorrow).
  const now = new Date();
  const { dateISO: todayISO } = utcToCenterLocal(now);
  const monthStartISO = `${todayISO.slice(0, 7)}-01`;
  const from = centerLocalToUtc(monthStartISO, 0);
  const to = centerLocalToUtc(todayISO, 1440); // exclusive upper bound = start of tomorrow

  const [performance, best, newVsReturningStats, conversion, traffic, pages, topClients] = await Promise.all([
    channelPerformance({ from, to }),
    bestChannels({ from, to }),
    newVsReturning({ from, to }),
    bookingConversion({ from, to }),
    trafficSources({ from, to }),
    topPages({ from, to, limit: TOP_PAGES_LIMIT }),
    topClientsByLtv(TOP_CLIENTS_LIMIT),
  ]);

  const cacChartData: BarChartDatum[] = performance
    .filter((row) => row.cacMinor !== null)
    .map((row) => ({ label: row.channel, value: row.cacMinor as number }));

  const trafficChartData: BarChartDatum[] = traffic.map((row) => ({ label: row.source, value: row.views }));

  const totalNewAndReturning = newVsReturningStats.newClients + newVsReturningStats.returningBookings;
  const newShare = totalNewAndReturning === 0 ? 0 : newVsReturningStats.newClients / totalNewAndReturning;

  return (
    <AdminShell
      user={user}
      title="Marketing & Growth"
      description={`Acquisition cost, lifetime value, and traffic performance for ${monthStartISO.slice(0, 7)} (month to date, center-local time).`}
      actions={
        canManageCampaigns ? (
          <Link
            href="/admin/marketing/campaigns"
            className="rounded bg-[var(--color-teal)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Manage campaign spend
          </Link>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-8">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
            CAC by Channel
          </h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="overflow-x-auto rounded border border-[var(--color-ink)]/10">
              <table className="w-full text-left text-sm" data-testid="cac-table">
                <thead className="bg-[var(--color-cream)]/60">
                  <tr>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Channel</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Acquisitions</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Spend</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">CAC</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Revenue</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Avg LTV</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-ink)]/60">
                        No channel activity yet this month.
                      </td>
                    </tr>
                  ) : (
                    performance.map((row) => (
                      <tr key={row.channel} className="border-t border-[var(--color-ink)]/10" data-testid="cac-row" data-channel={row.channel}>
                        <td className="px-4 py-2 text-[var(--color-ink)]">{row.channel}</td>
                        <td className="px-4 py-2 text-[var(--color-ink)]">{formatCount(row.acquisitions)}</td>
                        <td className="px-4 py-2 text-[var(--color-ink)]">{formatSar(row.spendMinor)}</td>
                        <td className="px-4 py-2 text-[var(--color-ink)]">{formatSarOrDash(row.cacMinor)}</td>
                        <td className="px-4 py-2 text-[var(--color-ink)]">{formatSar(row.revenueMinor)}</td>
                        <td className="px-4 py-2 text-[var(--color-ink)]">{formatSar(row.avgLtvMinor)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <BarChart title="CAC by Channel" data={cacChartData} valueFormatter={formatSar} emptyMessage="No channel has both spend and acquisitions yet." />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Best Channels</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              label="Lowest CAC"
              value={best.lowestCac ? `${best.lowestCac.channel} — ${formatSar(best.lowestCac.cacMinor)}` : "—"}
              subNote="Cheapest channel that acquired a client this month"
            />
            <StatCard
              label="Highest Avg LTV"
              value={best.highestAvgLtv ? `${best.highestAvgLtv.channel} — ${formatSar(best.highestAvgLtv.avgLtvMinor)}` : "—"}
              subNote="Channel whose acquired clients spend the most, lifetime"
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
            New vs Returning
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="New Clients" value={formatCount(newVsReturningStats.newClients)} />
            <StatCard label="Returning Bookings" value={formatCount(newVsReturningStats.returningBookings)} />
            <StatCard label="New Client Share" value={formatPercent(newShare)} subNote="Of new + returning bookings this month" />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
            Booking Conversion
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Sessions Started Booking" value={formatCount(conversion.startedSessions)} />
            <StatCard label="Bookings Completed" value={formatCount(conversion.completed)} />
            <StatCard label="Conversion Rate" value={formatPercent(conversion.rate)} />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
              Traffic Sources
            </h2>
            <div className="overflow-x-auto rounded border border-[var(--color-ink)]/10">
              <table className="w-full text-left text-sm" data-testid="traffic-sources-table">
                <thead className="bg-[var(--color-cream)]/60">
                  <tr>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Source</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Views</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {traffic.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-[var(--color-ink)]/60">
                        No traffic recorded yet this month.
                      </td>
                    </tr>
                  ) : (
                    traffic.map((row) => (
                      <tr key={row.source} className="border-t border-[var(--color-ink)]/10">
                        <td className="px-4 py-2 text-[var(--color-ink)]">{row.source}</td>
                        <td className="px-4 py-2 text-[var(--color-ink)]">{formatCount(row.views)}</td>
                        <td className="px-4 py-2 text-[var(--color-ink)]">{formatCount(row.sessions)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <BarChart title="Traffic Sources (Views)" data={trafficChartData} emptyMessage="No traffic recorded yet this month." />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Top Pages</h2>
          <div className="overflow-x-auto rounded border border-[var(--color-ink)]/10">
            <table className="w-full text-left text-sm" data-testid="top-pages-table">
              <thead className="bg-[var(--color-cream)]/60">
                <tr>
                  <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Path</th>
                  <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Views</th>
                </tr>
              </thead>
              <tbody>
                {pages.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-[var(--color-ink)]/60">
                      No page views recorded yet this month.
                    </td>
                  </tr>
                ) : (
                  pages.map((row) => (
                    <tr key={row.path} className="border-t border-[var(--color-ink)]/10">
                      <td className="px-4 py-2 text-[var(--color-ink)]">{row.path}</td>
                      <td className="px-4 py-2 text-[var(--color-ink)]">{formatCount(row.views)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
            Top Clients by Lifetime Value
          </h2>
          <div className="overflow-x-auto rounded border border-[var(--color-ink)]/10">
            <table className="w-full text-left text-sm" data-testid="top-clients-table">
              <thead className="bg-[var(--color-cream)]/60">
                <tr>
                  <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Client</th>
                  <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Lifetime Value</th>
                </tr>
              </thead>
              <tbody>
                {topClients.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-[var(--color-ink)]/60">
                      No clients with completed bookings yet.
                    </td>
                  </tr>
                ) : (
                  topClients.map((row) => (
                    <tr key={row.clientProfileId} className="border-t border-[var(--color-ink)]/10">
                      <td className="px-4 py-2 text-[var(--color-ink)]">{row.fullName}</td>
                      <td className="px-4 py-2 text-[var(--color-ink)]">{formatSar(row.ltvMinor)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
