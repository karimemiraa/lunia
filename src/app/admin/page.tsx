import Link from "next/link";
import { requireAdmin } from "./_components/requireAdmin";
import { AdminShell } from "./_components/AdminShell";
import { EmptyState } from "./_components/EmptyState";
import { StatusPill } from "./_components/StatusPill";
import { LiveClock } from "./_components/today/LiveClock";
import { ArrivalActions } from "./_components/today/ArrivalActions";
import { Sparkline } from "./_components/today/Sparkline";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { prisma } from "@/lib/db";
import { getNotificationFeed } from "@/modules/notifications/feed";
import { getTodayDashboard, type AttentionCard } from "@/modules/dashboard/today";

const CENTER_TZ = "Asia/Riyadh";
const fullDateFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, hour: "numeric", minute: "2-digit" });

function formatSar(minor: number): string {
  return `${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} SAR`;
}

const ATTENTION_ICON: Record<AttentionCard["type"], string> = {
  callback: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z",
  invoice: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  stock: "m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm-8 4.5 8 4.5 8-4.5M12 12v9",
  leave: "M3.5 5h17v16h-17zM3.5 9h17M9 14l2 2 4-4",
  inquiry: "M4 6h16v12H4zM4 7l8 6 8-6",
  whatsapp: "M4 5h16v11H9l-5 4zM8 9.5h8M8 12.5h5",
  document: "M6 3h8l4 4v14H6zM14 3v4h4M12 11v4M12 17.5v.5",
  lead: "M12 4v16M4 12h16",
  booking: "M3.5 5h17v16h-17zM3.5 9h17M8 3v4M16 3v4",
};

function KpiTile({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="relative flex flex-col gap-1.5 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[var(--color-teal)] to-[var(--color-gold)] opacity-70" />
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-ink)]/55">{label}</span>
      <span className="lunia-tabular font-[family-name:var(--font-display)] text-4xl font-medium leading-none tracking-tight text-[var(--color-ink)]">{value}</span>
      {sub && <span className="text-xs text-[var(--color-ink)]/50">{sub}</span>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

export default async function AdminHome() {
  const user = await requireAdmin();
  const p = user.permissions;
  const now = new Date();
  const feed = await getNotificationFeed(p);
  const [staff, today] = await Promise.all([
    prisma.staffProfile.findUnique({ where: { userId: user.id }, select: { fullName: true } }),
    getTodayDashboard({ permissions: p }, feed, now),
  ]);

  const firstName = staff?.fullName?.trim().split(/\s+/)[0] ?? "";
  const riyadhHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, hour: "numeric", hour12: false }).format(now));
  const greeting = riyadhHour < 12 ? "Good morning" : riyadhHour < 18 ? "Good afternoon" : "Good evening";

  const canManage = p.has(PERMISSIONS.BOOKING_MANAGE);
  const canBill = p.has(PERMISSIONS.BILLING_MANAGE);
  const canClinical = p.has(PERMISSIONS.CLINICAL_MANAGE);
  const canViewCustomer = p.has(PERMISSIONS.CLIENT_VIEW);

  const arrivals = today.arrivals;
  const nextUp = arrivals?.find((a) => a.startAt > now && (a.status === "CONFIRMED" || a.status === "REQUESTED"));
  const iAmClockedIn = today.now.clockedIn.some((s) => s.userId === user.id);

  return (
    <AdminShell user={user} title="Today" description={`${greeting}${firstName ? `, ${firstName}` : ""} — ${fullDateFmt.format(now)}.`} feed={feed}>
      {/* Now strip */}
      <section aria-label="Right now" className="lunia-card relative overflow-hidden p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <div>
              <p className="mb-1 flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--color-teal-ink)]">
                <span aria-hidden="true" className="lunia-live-dot h-1.5 w-1.5 rounded-full bg-[var(--color-teal-ink)]" />
                Riyadh time
              </p>
              <LiveClock initialISO={now.toISOString()} />
            </div>
            <div className="hidden h-12 w-px bg-[var(--line)] sm:block" aria-hidden="true" />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:flex sm:items-center sm:gap-8">
              {arrivals && (
                <div>
                  <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)]/50">Rooms in use</dt>
                  <dd className="lunia-tabular text-lg font-medium text-[var(--color-ink)]">
                    {today.now.roomsInUse}
                    <span className="text-[var(--color-ink)]/40"> / {today.now.roomsTotal}</span>
                  </dd>
                </div>
              )}
              {arrivals && (
                <div>
                  <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)]/50">In treatment</dt>
                  <dd className="lunia-tabular text-lg font-medium text-[var(--color-ink)]">{today.now.inProgress}</dd>
                </div>
              )}
              <div className="col-span-2">
                <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)]/50">Clocked in</dt>
                <dd className="text-sm text-[var(--color-ink)]">
                  {today.now.clockedIn.length === 0 ? (
                    <span className="text-[var(--color-ink)]/50">
                      No one yet ·{" "}
                      <Link href="/admin/me" className="font-medium text-[var(--color-teal-ink)] hover:underline">
                        Clock in
                      </Link>
                    </span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {today.now.clockedIn.slice(0, 6).map((s) => (
                        <span key={s.userId} className="lunia-pill" data-tone={s.userId === user.id ? "success" : "neutral"} title={`Since ${timeFmt.format(s.since)}`}>
                          {s.name.split(/\s+/)[0]}
                        </span>
                      ))}
                      {today.now.clockedIn.length > 6 && <span className="text-xs text-[var(--color-ink)]/50">+{today.now.clockedIn.length - 6}</span>}
                      {!iAmClockedIn && (
                        <Link href="/admin/me" className="text-xs font-medium text-[var(--color-teal-ink)] hover:underline">
                          Clock in
                        </Link>
                      )}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <Link href="/admin/calendar?add=1" className="lunia-btn lunia-btn-forest lunia-btn-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
                Book walk-in
              </Link>
            )}
            {canBill && (
              <Link href="/admin/billing/new" className="lunia-btn lunia-btn-forest-outline lunia-btn-sm">
                New invoice
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* KPI row */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {today.kpis.revenueTodayMinor !== null && (
          <KpiTile label="Collected today" value={formatSar(today.kpis.revenueTodayMinor)} sub="Payments received" />
        )}
        {today.kpis.appointmentsToday !== null && (
          <KpiTile label="Appointments" value={String(today.kpis.appointmentsToday)} sub={nextUp ? `Next at ${timeFmt.format(nextUp.startAt)}` : "Booked for today"}>
            {today.spark && <Sparkline title="Appointments, last 7 days" points={today.spark.map((s) => ({ label: s.label, value: s.appointments }))} />}
          </KpiTile>
        )}
        {today.kpis.newCustomersToday !== null && <KpiTile label="New customers" value={String(today.kpis.newCustomersToday)} sub="Created today" />}
        {today.kpis.appointmentsToday !== null && (
          <KpiTile
            label="Occupancy"
            value={today.kpis.occupancyPct === null ? "—" : `${today.kpis.occupancyPct}%`}
            sub={today.kpis.occupancyPct === null ? "Closed today" : `Across ${today.now.roomsTotal} room${today.now.roomsTotal === 1 ? "" : "s"}`}
          >
            {today.kpis.occupancyPct !== null && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-ink)]/[0.07]" aria-hidden="true">
                <div className="h-full rounded-full bg-[var(--color-teal)]" style={{ width: `${today.kpis.occupancyPct}%` }} />
              </div>
            )}
          </KpiTile>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Arrivals timeline */}
        {arrivals && (
          <section aria-labelledby="arrivals-h" className="lunia-card overflow-hidden lg:col-span-2">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
              <h2 id="arrivals-h" className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">
                Arrivals
              </h2>
              <Link href={`/admin/calendar?day=${today.todayISO}`} className="text-xs font-medium text-[var(--color-teal-ink)] hover:underline">
                Open in calendar
              </Link>
            </div>
            {arrivals.length === 0 ? (
              <EmptyState
                title="No arrivals yet"
                body="Nothing is booked for today. Walk-ins can be added in a few seconds."
                action={canManage ? { href: "/admin/calendar?add=1", label: "Book a walk-in" } : undefined}
                icon={<><path d="M3.5 9h17M8 3v4M16 3v4" /><rect x="3.5" y="5" width="17" height="16" rx="2" /></>}
              />
            ) : (
              <ol className="divide-y divide-[var(--line)]">
                {arrivals.map((a) => {
                  const past = a.endAt < now;
                  const live = a.startAt <= now && a.endAt > now;
                  return (
                    <li key={a.appointmentId} className={`flex gap-4 px-5 py-3.5 ${past && a.status !== "CHECKED_IN" ? "opacity-60" : ""} ${live ? "bg-[var(--color-teal)]/[0.08]" : ""}`}>
                      <div className="w-16 shrink-0 pt-0.5">
                        <time dateTime={a.startAt.toISOString()} className="lunia-tabular block text-sm font-semibold text-[var(--color-ink)]">
                          {timeFmt.format(a.startAt)}
                        </time>
                        <span className="lunia-tabular block text-[0.68rem] text-[var(--color-ink)]/45">{timeFmt.format(a.endAt)}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {canViewCustomer ? (
                            <Link href={`/admin/clients/${a.clientProfileId}`} className="truncate font-medium text-[var(--color-ink)] hover:underline">
                              {a.clientName}
                            </Link>
                          ) : (
                            <span className="truncate font-medium text-[var(--color-ink)]">{a.clientName}</span>
                          )}
                          <StatusPill status={a.status} />
                          {live && <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-teal-ink)]">Now</span>}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-[var(--color-ink)]/60">
                          {a.serviceName} · {a.staffName} · {a.roomName}
                        </p>
                        {a.customerNote && <p className="mt-1 truncate text-xs italic text-[var(--color-ink)]/50">“{a.customerNote}”</p>}
                        <div className="mt-2">
                          <ArrivalActions
                            bookingId={a.bookingId}
                            clientProfileId={a.clientProfileId}
                            clientName={a.clientName}
                            status={a.status}
                            canManage={canManage}
                            canBill={canBill}
                            canClinical={canClinical}
                            canViewCustomer={canViewCustomer}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        )}

        <div className={`flex flex-col gap-6 ${arrivals ? "" : "lg:col-span-3"}`}>
          {/* Attention */}
          <section aria-labelledby="attention-h" className="lunia-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="attention-h" className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">
                Needs attention
              </h2>
              <Link href="/admin/notifications" className="text-xs font-medium text-[var(--color-teal-ink)] hover:underline">
                View all
              </Link>
            </div>
            {today.attention.length === 0 ? (
              <EmptyState size="sm" title="All clear" body="Nothing is waiting on you right now." icon={<path d="m5 12.5 4.5 4.5L19 7" />} />
            ) : (
              <ul className={`grid gap-2 ${arrivals ? "" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
                {today.attention.map((card) => (
                  <li key={card.type}>
                    <Link
                      href={card.href}
                      className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] px-3 py-2.5 transition-colors hover:border-[var(--color-teal)] hover:bg-[var(--color-teal)]/[0.08] focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{ background: `var(--status-${card.tone}-bg)`, color: `var(--status-${card.tone})` }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <path d={ATTENTION_ICON[card.type]} />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-ink)]">{card.label}</span>
                      <span className="lunia-tabular text-sm font-semibold" style={{ color: `var(--status-${card.tone})` }}>
                        {card.count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* This week */}
          {today.week && (
            <section aria-labelledby="week-h" className="lunia-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="week-h" className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">
                  This week
                </h2>
                <Link href="/admin/calendar" className="text-xs font-medium text-[var(--color-teal-ink)] hover:underline">
                  Calendar
                </Link>
              </div>
              <ol className="grid grid-cols-7 gap-1">
                {today.week.map((d) => (
                  <li key={d.dateISO}>
                    <Link
                      href={`/admin/calendar?day=${d.dateISO}`}
                      aria-label={`${d.weekday} ${d.dayOfMonth}: ${d.count} appointment${d.count === 1 ? "" : "s"}${d.closed ? ", closed" : ""}`}
                      aria-current={d.isToday ? "date" : undefined}
                      className={`flex flex-col items-center gap-1 rounded-[var(--radius-sm)] py-2 text-center transition-colors hover:bg-[var(--color-teal)]/[0.15] focus-visible:outline-none focus-visible:shadow-[var(--ring)] ${
                        d.isToday ? "bg-[var(--color-teal)]/30" : ""
                      } ${d.closed ? "opacity-50" : ""}`}
                    >
                      <span className="text-[0.62rem] font-semibold uppercase tracking-wider text-[var(--color-ink)]/50">{d.weekday}</span>
                      <span className={`lunia-tabular text-sm ${d.isToday ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-ink)]/80"}`}>{d.dayOfMonth}</span>
                      <span className={`lunia-tabular text-xs ${d.count > 0 ? "font-medium text-[var(--color-teal-ink)]" : "text-[var(--color-ink)]/30"}`}>{d.count > 0 ? d.count : "·"}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
