import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { prisma } from "@/lib/db";
import { getLeaveBalance, listLeaveRequests, splitReason, upcomingAbsences } from "@/modules/hr/leave";
import { LEAVE_TYPE_LABELS, type LeaveType } from "@/modules/hr/constants";
import { todayISO } from "@/modules/hr/dates";
import { HrTabs } from "../_components/HrTabs";
import { badge, badgeBase, dateLabel, dayLabel } from "../_components/format";
import { DecisionForm } from "./DecisionForm";
import { decideLeaveAction } from "./actions";

const STATUS_BADGE: Record<string, string> = {
  PENDING: badge.warn,
  APPROVED: badge.good,
  REJECTED: badge.bad,
  CANCELLED: badge.neutral,
};

const typeLabel = (t: string) => LEAVE_TYPE_LABELS[t as LeaveType] ?? t;

export default async function LeavePage() {
  const user = await requireAdmin(PERMISSIONS.HR_MANAGE);
  const today = todayISO();
  const [requests, absences, staff] = await Promise.all([
    listLeaveRequests(),
    upcomingAbsences(today, 30),
    prisma.user.findMany({
      where: { type: "STAFF", isActive: true },
      select: { id: true, email: true, staffProfile: { select: { fullName: true } } },
    }),
  ]);
  const nameOf = (u: { email: string | null; staffProfile: { fullName: string } | null }) => u.staffProfile?.fullName || u.email || "Staff";

  const pending = requests.filter((r) => r.status === "PENDING").sort((a, b) => a.startDateISO.localeCompare(b.startDateISO));
  const decided = requests.filter((r) => r.status !== "PENDING").slice(0, 40);
  const approved = requests.filter((r) => r.status === "APPROVED");

  const balances = await Promise.all(
    staff.map(async (s) => ({ userId: s.id, name: nameOf(s), balance: await getLeaveBalance(s.id, today) })),
  );
  balances.sort((a, b) => a.name.localeCompare(b.name));
  const balanceById = new Map(balances.map((b) => [b.userId, b.balance]));

  return (
    <AdminShell user={user} title="Leave" description="Approve requests, see who is off and track annual leave balances.">
      <HrTabs active="leave" />

      <section className="mb-8">
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl">
          Waiting for approval {pending.length > 0 && <span className="text-[var(--color-ink)]/50">({pending.length})</span>}
        </h2>
        {pending.length === 0 ? (
          <p className="lunia-card p-5 text-sm text-[var(--color-ink)]/60">Nothing waiting. New requests appear here and in the notification bell.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map((r) => {
              const bal = balanceById.get(r.userId);
              const others = approved.filter(
                (a) => a.userId !== r.userId && a.startDateISO <= r.endDateISO && a.endDateISO >= r.startDateISO,
              );
              const { reason } = splitReason(r.reason);
              return (
                <div key={r.id} className="lunia-card flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {nameOf(r.user)} · {typeLabel(r.type)} · {r.days} day{r.days === 1 ? "" : "s"}
                    </p>
                    <p className="text-sm text-[var(--color-ink)]/65">
                      {dateLabel(r.startDateISO)} to {dateLabel(r.endDateISO)}
                      {reason ? ` · “${reason}”` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--color-ink)]/60">
                      {r.type === "ANNUAL" && bal && (
                        <span className={bal.remainingYearDays < 0 ? "font-semibold text-red-700" : ""}>
                          Balance {bal.balanceDays} days accrued · {bal.annualDays - bal.usedDays} left this service year
                        </span>
                      )}
                      {others.length > 0 && (
                        <span className="font-medium text-[var(--color-ink)]/75">
                          Also off: {others.map((o) => nameOf(o.user)).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <DecisionForm action={decideLeaveAction.bind(null, r.id)} />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl">Who is off (next 30 days)</h2>
          {absences.length === 0 ? (
            <p className="lunia-card p-5 text-sm text-[var(--color-ink)]/60">Everyone is in.</p>
          ) : (
            <ul className="lunia-card divide-y divide-[var(--line)]">
              {absences.map((day) => (
                <li key={day.dateISO} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <span className="w-28 shrink-0 text-sm font-medium">{dayLabel(day.dateISO)}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {day.people.map((p) => (
                      <span key={p.userId} className={`${badgeBase} ${p.status === "APPROVED" ? badge.good : badge.warn} normal-case tracking-normal`}>
                        {p.name} · {typeLabel(p.type)}
                        {p.status === "PENDING" ? " (pending)" : ""}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl">Annual leave balances</h2>
          <div className="overflow-x-auto lunia-card">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.1em] text-[var(--color-ink)]/55">
                  <th className="px-4 py-3 font-semibold">Employee</th>
                  <th className="px-4 py-3 text-right font-semibold">Per year</th>
                  <th className="px-4 py-3 text-right font-semibold">Accrued</th>
                  <th className="px-4 py-3 text-right font-semibold">Used</th>
                  <th className="px-4 py-3 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {balances.map(({ userId, name, balance }) => (
                  <tr key={userId} className="border-t border-[var(--line)]">
                    <td className="px-4 py-3 font-medium">{name}</td>
                    <td className="px-4 py-3 text-right">{balance.annualDays}</td>
                    <td className="px-4 py-3 text-right">{balance.accruedDays}</td>
                    <td className="px-4 py-3 text-right">
                      {balance.usedDays}
                      {balance.pendingDays > 0 && <span className="text-[var(--color-ink)]/50"> +{balance.pendingDays}</span>}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${balance.balanceDays < 0 ? "text-red-700" : ""}`}>
                      {balance.balanceDays}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--color-ink)]/55">
            Accrued pro-rata over each employee&apos;s service year (21 days, 30 after five years). Used counts approved annual leave
            starting in the current service year; pending shown as +n.
          </p>
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl">Recent decisions</h2>
        {decided.length === 0 ? (
          <p className="text-sm text-[var(--color-ink)]/60">None yet.</p>
        ) : (
          <ul className="lunia-card divide-y divide-[var(--line)]">
            {decided.map((r) => {
              const { reason, hrNote } = splitReason(r.reason);
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span>
                    <span className="font-medium">{nameOf(r.user)}</span> · {typeLabel(r.type)} · {dateLabel(r.startDateISO)} to{" "}
                    {dateLabel(r.endDateISO)} ({r.days}d){reason ? ` · “${reason}”` : ""}
                    {hrNote && <span className="text-[var(--color-ink)]/60"> · HR: {hrNote}</span>}
                  </span>
                  <span className={`${badgeBase} ${STATUS_BADGE[r.status] ?? badge.neutral}`}>{r.status.toLowerCase()}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
