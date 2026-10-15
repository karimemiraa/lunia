import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getStaffT } from "../_i18n/display";
import { channelPerformance, bestChannels, newVsReturning } from "@/modules/crm/marketing";
import { topClientsByLtv } from "@/modules/crm/ltv";
import { trafficSources, topPages, bookingConversion } from "@/modules/analytics/queries";
import { centerLocalToUtc, utcToCenterLocal } from "@/modules/booking/availability";
import { StatCard } from "@/components/admin/charts/StatCard";
import { BarChart, type BarChartDatum } from "@/components/admin/charts/BarChart";

const TOP_PAGES_LIMIT = 10;
const TOP_CLIENTS_LIMIT = 10;

/** priceMinor / spendMinor / revenueMinor / ltvMinor are stored in halalas (1/100 SAR). */
function formatSarWith(minor: number, unit: string): string {
  const major = minor / 100;
  return `${major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unit}`;
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
  const t = await getStaffT();
  const formatSar = (minor: number): string => formatSarWith(minor, t("SAR"));
  const formatSarOrDash = (minor: number | null): string => (minor === null ? t("None") : formatSar(minor));

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
      description={t("Acquisition cost, lifetime value, and traffic performance for {month} (month to date, center-local time).", { month: monthStartISO.slice(0, 7) })}
      actions={
        canManageCampaigns ? (
          <Link
            href="/admin/marketing/campaigns"
            className="lunia-btn lunia-btn-primary"
          >
            {t("Manage campaign spend")}
          </Link>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] bg-[var(--color-forest)] px-6 py-5 text-[var(--color-on-ink)] shadow-[var(--shadow-sm)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-teal)]">{t("Marketing & Growth")}</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl">{t("Month to date")}</p>
        </div>
        <div className="flex flex-wrap gap-6">
          <div><p className="text-xs uppercase tracking-wide text-[var(--color-on-ink)]/60">{t("New customers")}</p><p className="text-2xl font-medium">{formatCount(newVsReturningStats.newClients)}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-[var(--color-on-ink)]/60">{t("Conversion")}</p><p className="text-2xl font-medium">{formatPercent(conversion.rate)}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-[var(--color-on-ink)]/60">{t("Best channel")}</p><p className="text-2xl font-medium">{best.lowestCac ? best.lowestCac.channel : t("None")}</p></div>
        </div>
      </div>
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
            {t("CAC by Channel")}
          </h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="overflow-x-auto lunia-card">
              <table className="w-full text-start text-sm" data-testid="cac-table">
                <thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
                  <tr>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Channel")}</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Acquisitions")}</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Spend")}</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("CAC")}</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Revenue")}</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Avg LTV")}</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-ink)]/60">
                        {t("No channel activity yet this month.")}
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
            <BarChart title={t("CAC by Channel")} data={cacChartData} valueFormatter={formatSar} emptyMessage={t("No channel has both spend and acquisitions yet.")} />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">{t("Best Channels")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              label={t("Lowest CAC")}
              value={best.lowestCac ? `${best.lowestCac.channel}: ${formatSar(best.lowestCac.cacMinor)}` : t("None")}
              subNote={t("Cheapest channel that acquired a customer this month")}
            />
            <StatCard
              label={t("Highest Avg LTV")}
              value={best.highestAvgLtv ? `${best.highestAvgLtv.channel}: ${formatSar(best.highestAvgLtv.avgLtvMinor)}` : t("None")}
              subNote={t("Channel whose acquired customers spend the most, lifetime")}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
            {t("New vs Returning")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label={t("New Customers")} value={formatCount(newVsReturningStats.newClients)} />
            <StatCard label={t("Returning Bookings")} value={formatCount(newVsReturningStats.returningBookings)} />
            <StatCard label={t("New Customer Share")} value={formatPercent(newShare)} subNote={t("Of new + returning bookings this month")} />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
            {t("Booking Conversion")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label={t("Sessions Started Booking")} value={formatCount(conversion.startedSessions)} />
            <StatCard label={t("Bookings Completed")} value={formatCount(conversion.completed)} />
            <StatCard label={t("Conversion Rate")} value={formatPercent(conversion.rate)} />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
              {t("Traffic Sources")}
            </h2>
            <div className="overflow-x-auto lunia-card">
              <table className="w-full text-start text-sm" data-testid="traffic-sources-table">
                <thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
                  <tr>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Source")}</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Views")}</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Sessions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {traffic.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-[var(--color-ink)]/60">
                        {t("No traffic recorded yet this month.")}
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
          <BarChart title={t("Traffic Sources (Views)")} data={trafficChartData} emptyMessage={t("No traffic recorded yet this month.")} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">{t("Top Pages")}</h2>
          <div className="overflow-x-auto lunia-card">
            <table className="w-full text-start text-sm" data-testid="top-pages-table">
              <thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
                <tr>
                  <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Path")}</th>
                  <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Views")}</th>
                </tr>
              </thead>
              <tbody>
                {pages.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-[var(--color-ink)]/60">
                      {t("No page views recorded yet this month.")}
                    </td>
                  </tr>
                ) : (
                  pages.map((row) => (
                    <tr key={row.path} className="border-t border-[var(--color-ink)]/10">
                      <td className="px-4 py-2 text-[var(--color-ink)]" dir="ltr">{row.path}</td>
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
            {t("Top Clients by Lifetime Value")}
          </h2>
          <div className="overflow-x-auto lunia-card">
            <table className="w-full text-start text-sm" data-testid="top-clients-table">
              <thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
                <tr>
                  <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Customer")}</th>
                  <th className="px-4 py-2 font-medium text-[var(--color-ink)]">{t("Lifetime Value")}</th>
                </tr>
              </thead>
              <tbody>
                {topClients.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-[var(--color-ink)]/60">
                      {t("No clients with completed bookings yet.")}
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
