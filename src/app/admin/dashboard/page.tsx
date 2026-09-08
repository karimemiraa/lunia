import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { bookingStats, upcomingAppointmentsCount, type DayStat } from "@/modules/booking/stats";
import { centerLocalToUtc, utcToCenterLocal, weekdayForDateISO } from "@/modules/booking/availability";
import { StatCard } from "@/components/admin/charts/StatCard";
import { BarChart, type BarChartDatum } from "@/components/admin/charts/BarChart";
import { LineChart, type LineChartDatum } from "@/components/admin/charts/LineChart";

const LAST_N_DAYS = 30;
const TOP_SERVICES_LIMIT = 6;

/** priceMinor / revenueMinor are stored in halalas (1/100 SAR). */
function formatSar(minor: number): string {
  const major = minor / 100;
  return `${major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/** Adds `days` (may be negative) to a "YYYY-MM-DD" string via pure calendar
 * math -- consistent with availability.ts's other center-local date helpers,
 * none of which depend on the host machine's local timezone. */
function addDaysISO(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Expands sparse byDay rows (bookingStats omits days with zero bookings)
 * into one entry per calendar day from `fromISO` to `toISO` inclusive, so
 * the line chart shows a continuous, evenly-spaced 30-day trend rather than
 * only the days that happened to have a booking. */
function buildDailyRevenueSeries(byDay: DayStat[], fromISO: string, toISO: string): LineChartDatum[] {
  const revenueByDate = new Map(byDay.map((d) => [d.date, d.revenueMinor]));
  const series: LineChartDatum[] = [];
  for (let cursor = fromISO; cursor <= toISO; cursor = addDaysISO(cursor, 1)) {
    series.push({ date: cursor, value: revenueByDate.get(cursor) ?? 0 });
  }
  return series;
}

export default async function BusinessDashboardPage() {
  const user = await requireAdmin(PERMISSIONS.ANALYTICS_VIEW);

  const now = new Date();
  const { dateISO: todayISO } = utcToCenterLocal(now);
  const todayFrom = centerLocalToUtc(todayISO, 0);
  const todayTo = centerLocalToUtc(todayISO, 1440); // exclusive upper bound = start of tomorrow

  const weekStartISO = addDaysISO(todayISO, -weekdayForDateISO(todayISO)); // current week, Sunday-start
  const weekFrom = centerLocalToUtc(weekStartISO, 0);

  const monthStartISO = `${todayISO.slice(0, 7)}-01`;
  const monthFrom = centerLocalToUtc(monthStartISO, 0);

  const last30StartISO = addDaysISO(todayISO, -(LAST_N_DAYS - 1));
  const last30From = centerLocalToUtc(last30StartISO, 0);

  const [todayStats, weekStats, monthStats, last30Stats, upcoming] = await Promise.all([
    bookingStats({ from: todayFrom, to: todayTo }),
    bookingStats({ from: weekFrom, to: todayTo }),
    bookingStats({ from: monthFrom, to: todayTo }),
    bookingStats({ from: last30From, to: todayTo }),
    upcomingAppointmentsCount(now),
  ]);

  const topServices: BarChartDatum[] = monthStats.byService
    .slice(0, TOP_SERVICES_LIMIT)
    .map((service) => ({ label: service.name, value: service.revenueMinor }));

  const dailyRevenue = buildDailyRevenueSeries(last30Stats.byDay, last30StartISO, todayISO);

  return (
    <AdminShell
      user={user}
      title="Business Dashboard"
      description="Realized revenue, booking volume, and service performance at a glance."
    >
      <div className="flex flex-col gap-8">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
            Revenue (realized)
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Today" value={formatSar(todayStats.revenueMinor)} subNote={`${formatCount(todayStats.totalBookings)} bookings`} />
            <StatCard
              label="This Week"
              value={formatSar(weekStats.revenueMinor)}
              subNote={`${formatCount(weekStats.totalBookings)} bookings`}
            />
            <StatCard
              label="This Month"
              value={formatSar(monthStats.revenueMinor)}
              subNote={`${formatCount(monthStats.totalBookings)} bookings`}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Bookings</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard label="Total Bookings (This Month)" value={formatCount(monthStats.totalBookings)} />
            <StatCard
              label="Upcoming Appointments"
              value={formatCount(upcoming)}
              subNote="Confirmed or checked-in, not yet completed"
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
            New vs Returning Clients (This Month)
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard label="New Clients" value={formatCount(monthStats.newClients)} />
            <StatCard label="Returning Bookings" value={formatCount(monthStats.returningBookings)} />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <BarChart title="Top Services (This Month)" data={topServices} valueFormatter={formatSar} emptyMessage="No bookings yet this month." />
          <LineChart
            title={`Revenue — Last ${LAST_N_DAYS} Days`}
            data={dailyRevenue}
            valueFormatter={formatSar}
            emptyMessage="No revenue data yet."
          />
        </section>
      </div>
    </AdminShell>
  );
}
