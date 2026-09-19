import type { ReactNode } from "react";
import { requireAdmin } from "./_components/requireAdmin";
import { AdminShell } from "./_components/AdminShell";
import { PERMISSIONS, type PermissionKey } from "@/modules/iam/permissions";
import { prisma } from "@/lib/db";
import { centerLocalToUtc, utcToCenterLocal } from "@/modules/booking/availability";
import { listDayAppointments } from "@/modules/booking/bookings";
import { bookingStats, upcomingAppointmentsCount } from "@/modules/booking/stats";
import { StatCard } from "@/components/admin/charts/StatCard";

function formatSar(minor: number): string {
  return `${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} SAR`;
}

interface QuickLink {
  href: string;
  label: string;
  description: string;
  permission: PermissionKey;
  icon: "calendar" | "users" | "chart" | "image" | "gear" | "layers";
}

const QUICK_LINKS: QuickLink[] = [
  { href: "/admin/calendar", label: "Calendar", description: "Bookings, walk-ins & check-ins", permission: PERMISSIONS.BOOKING_VIEW, icon: "calendar" },
  { href: "/admin/clients", label: "Customers", description: "Profiles, history & membership", permission: PERMISSIONS.CLIENT_VIEW, icon: "users" },
  { href: "/admin/dashboard", label: "Business", description: "Revenue, LTV & performance", permission: PERMISSIONS.ANALYTICS_VIEW, icon: "chart" },
  { href: "/admin/media", label: "Media library", description: "Hero images & photography", permission: PERMISSIONS.CMS_MANAGE, icon: "image" },
  { href: "/admin/content", label: "Page content", description: "Editable site copy & sections", permission: PERMISSIONS.CMS_MANAGE, icon: "layers" },
  { href: "/admin/settings", label: "Site settings", description: "Hours, contact, SEO & social", permission: PERMISSIONS.SETTINGS_MANAGE, icon: "gear" },
];

const ICONS: Record<QuickLink["icon"], ReactNode> = {
  calendar: <path strokeLinecap="round" d="M3.5 9h17M8 3v4M16 3v4M3.5 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  users: <path strokeLinecap="round" d="M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11ZM3.5 20a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.5M20.5 20a4.8 4.8 0 0 0-3-4.4" />,
  chart: <path strokeLinecap="round" d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6" />,
  image: <path strokeLinejoin="round" d="M3.5 6.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM4 18l5-5 4 4 3-3 4 4M9 10.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />,
  layers: <path strokeLinejoin="round" d="m12 3 8 4-8 4-8-4 8-4ZM4 12l8 4 8-4M4 17l8 4 8-4" />,
  gear: <path strokeLinecap="round" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />,
};

const CENTER_TZ = "Asia/Riyadh";
const fullDateFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default async function AdminHome() {
  const user = await requireAdmin();
  const links = QUICK_LINKS.filter((link) => user.permissions.has(link.permission));

  // Personalize: greet the signed-in staff member by name + time of day, and
  // surface today's real schedule at a glance.
  const now = new Date();
  const todayISO = utcToCenterLocal(now).dateISO;
  const monthStartISO = `${todayISO.slice(0, 7)}-01`;
  const canSeeAnalytics = user.permissions.has(PERMISSIONS.ANALYTICS_VIEW);
  const [staff, todaysAppointments, monthStats, upcoming] = await Promise.all([
    prisma.staffProfile.findUnique({ where: { userId: user.id }, select: { fullName: true } }),
    user.permissions.has(PERMISSIONS.BOOKING_VIEW) ? listDayAppointments(todayISO) : Promise.resolve([]),
    canSeeAnalytics ? bookingStats({ from: centerLocalToUtc(monthStartISO, 0), to: centerLocalToUtc(todayISO, 1440) }) : Promise.resolve(null),
    user.permissions.has(PERMISSIONS.BOOKING_VIEW) ? upcomingAppointmentsCount(now) : Promise.resolve(0),
  ]);
  const firstName = staff?.fullName?.trim().split(/\s+/)[0] ?? "";
  const riyadhHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, hour: "numeric", hour12: false }).format(new Date()),
  );
  const greeting = riyadhHour < 12 ? "Good morning" : riyadhHour < 18 ? "Good afternoon" : "Good evening";
  const heading = firstName ? `${greeting}, ${firstName}` : greeting;

  const liveCount = todaysAppointments.filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW").length;
  const scheduleLine =
    liveCount === 0
      ? "No appointments booked for today yet."
      : `You have ${liveCount} appointment${liveCount === 1 ? "" : "s"} booked today.`;

  return (
    <AdminShell user={user} title="Dashboard" description="Your center at a glance.">
      <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-forest)] p-8 text-[var(--color-cream)] shadow-[var(--shadow-md)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--color-teal)_45%,transparent),transparent_70%)]"
        />
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-teal)]">{fullDateFmt.format(new Date())}</p>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-snug">{heading}</h2>
        <p className="mt-2 text-sm text-[var(--color-cream)]/80">{scheduleLine}</p>
      </div>

      {/* KPI snapshot — real numbers so the dashboard reads as a dashboard. */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Appointments today" value={String(liveCount)} />
        <StatCard label="Upcoming appointments" value={String(upcoming)} subNote="Confirmed or checked-in" />
        {monthStats && <StatCard label="Revenue this month" value={formatSar(monthStats.revenueMinor)} subNote={`${monthStats.totalBookings} bookings`} />}
        {monthStats && <StatCard label="New customers this month" value={String(monthStats.newClients)} />}
      </div>

      {links.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link, i) => (
            <a
              key={link.href}
              href={link.href}
              style={{ animationDelay: `${i * 50}ms` }}
              className="lunia-animate-fade-up group flex items-start gap-4 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--color-teal)_50%,transparent)] hover:shadow-[var(--shadow-md)]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--color-teal)]/15 text-[var(--color-teal-ink)] transition-colors group-hover:bg-[var(--color-teal)]/25">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
                  {ICONS[link.icon]}
                </svg>
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-medium text-[var(--color-ink)]">{link.label}</span>
                <span className="text-xs leading-relaxed text-[var(--color-ink)]/55">{link.description}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
