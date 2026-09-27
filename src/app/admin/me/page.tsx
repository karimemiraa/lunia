import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { getMyAttendance } from "@/modules/hr/attendance";
import { getLeaveBalance, listLeaveRequests, splitReason } from "@/modules/hr/leave";
import { listOwnPayslips } from "@/modules/hr/payroll";
import { LEAVE_TYPES, LEAVE_TYPE_LABELS, type LeaveType } from "@/modules/hr/constants";
import { todayISO } from "@/modules/hr/dates";
import { ActionForm } from "../hr/_components/ActionForm";
import { badge, badgeBase, dateLabel, hoursLabel, monthLabel, sar, timeLabel } from "../hr/_components/format";
import { cancelLeaveAction, clockAction, requestLeaveAction } from "./actions";

const STATUS_BADGE: Record<string, string> = {
  PENDING: badge.warn,
  APPROVED: badge.good,
  REJECTED: badge.bad,
  CANCELLED: badge.neutral,
};

export default async function MyTimePage() {
  const user = await requireAdmin();
  const today = todayISO();
  const [me, balance, requests, payslips] = await Promise.all([
    getMyAttendance(user.id),
    getLeaveBalance(user.id),
    listLeaveRequests({ userId: user.id }),
    listOwnPayslips(user.id),
  ]);

  return (
    <AdminShell user={user} title="My time & leave" description="Clock in and out, see your hours and request time off.">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        {/* Clock */}
        <section className="lunia-card flex flex-col items-center gap-4 p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-teal-ink)]">{dateLabel(today)}</p>
          <p className="font-[family-name:var(--font-display)] text-3xl">
            {me.clockedIn ? `On shift since ${timeLabel(me.today.openSince)}` : me.today.records.length ? "Off shift" : "Not clocked in yet"}
          </p>
          <ActionForm
            action={clockAction}
            submitLabel={me.clockedIn ? "Clock out" : "Clock in"}
            pendingLabel="One moment…"
            className="flex w-full flex-col items-center gap-3"
            buttonClassName={`lunia-btn ${me.clockedIn ? "lunia-btn-ink" : "lunia-btn-primary"} w-full max-w-sm py-5 text-lg`}
          >
            <input type="hidden" name="direction" value={me.clockedIn ? "out" : "in"} />
          </ActionForm>
          {me.today.late && (
            <p className={`${badgeBase} ${badge.warn}`}>Late today by {me.today.lateByMin} min</p>
          )}
          {me.today.records.length > 0 && (
            <ul className="w-full max-w-sm divide-y divide-[var(--line)] text-sm">
              {me.today.records.map((r) => (
                <li key={r.id} className="flex justify-between py-2">
                  <span>In {timeLabel(r.clockInAt)}</span>
                  <span>{r.clockOutAt ? `Out ${timeLabel(r.clockOutAt)}` : "Open"}</span>
                </li>
              ))}
            </ul>
          )}
          {me.missingOutCount > 0 && (
            <p className="text-sm text-red-700">
              {me.missingOutCount} earlier shift{me.missingOutCount === 1 ? " has" : "s have"} no clock-out. Please tell HR so it can be corrected.
            </p>
          )}
        </section>

        {/* Month + balance */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="lunia-card p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-ink)]/55">This month</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-3xl">{hoursLabel(me.monthWorkedMin)}</p>
            <p className="mt-1 text-sm text-[var(--color-ink)]/60">
              {me.daysWorked} day{me.daysWorked === 1 ? "" : "s"} worked · {me.lateDays} late
            </p>
          </div>
          <div className="lunia-card p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-ink)]/55">Annual leave balance</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-3xl">{balance.balanceDays} days</p>
            <p className="mt-1 text-sm text-[var(--color-ink)]/60">
              {balance.annualDays} days a year · {balance.usedDays} used · {balance.pendingDays} pending
            </p>
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="lunia-card p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Request leave</h2>
          <ActionForm action={requestLeaveAction} submitLabel="Send request" pendingLabel="Sending…" className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">Type</span>
              <select name="type" defaultValue="ANNUAL" className="lunia-input min-h-11">
                {LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LEAVE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">From</span>
                <input type="date" name="startDateISO" required defaultValue={today} className="lunia-input min-h-11" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">To (inclusive)</span>
                <input type="date" name="endDateISO" required defaultValue={today} className="lunia-input min-h-11" />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">Reason (optional)</span>
              <textarea name="reason" rows={2} maxLength={500} className="lunia-input" />
            </label>
          </ActionForm>
        </section>

        <section className="lunia-card p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl">My requests</h2>
          {requests.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-ink)]/60">No leave requests yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--line)]">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {LEAVE_TYPE_LABELS[r.type as LeaveType] ?? r.type} · {r.days} day{r.days === 1 ? "" : "s"}
                    </p>
                    <p className="text-xs text-[var(--color-ink)]/60">
                      {dateLabel(r.startDateISO)} to {dateLabel(r.endDateISO)}
                    </p>
                    {splitReason(r.reason).hrNote && (
                      <p className="text-xs text-[var(--color-ink)]/75">HR note: {splitReason(r.reason).hrNote}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`${badgeBase} ${STATUS_BADGE[r.status] ?? badge.neutral}`}>{r.status.toLowerCase()}</span>
                    {r.status === "PENDING" && (
                      <ActionForm
                        action={cancelLeaveAction.bind(null, r.id)}
                        submitLabel="Cancel"
                        pendingLabel="…"
                        buttonClassName="lunia-btn lunia-btn-ghost lunia-btn-sm"
                        confirmMessage="Cancel this leave request?"
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {payslips.length > 0 && (
        <section className="lunia-card mt-6 p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl">My payslips</h2>
          <ul className="mt-3 divide-y divide-[var(--line)]">
            {payslips.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/admin/hr/payroll/${p.payrollRun.id}/${user.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm hover:text-[var(--color-teal-ink)]"
                >
                  <span className="font-medium">{monthLabel(p.payrollRun.periodMonth)}</span>
                  <span>{sar(p.netMinor)} net</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AdminShell>
  );
}
