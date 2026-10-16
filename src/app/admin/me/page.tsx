import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { getMyAttendance } from "@/modules/hr/attendance";
import { getLeaveBalance, listLeaveRequests, splitReason } from "@/modules/hr/leave";
import { listOwnPayslips } from "@/modules/hr/payroll";
import { commissionLines, monthRange, summarize, type CommissionSource } from "@/modules/hr/commission";
import { prisma } from "@/lib/db";
import { LEAVE_TYPES, LEAVE_TYPE_LABELS, type LeaveType } from "@/modules/hr/constants";
import { todayISO } from "@/modules/hr/dates";
import { ActionForm } from "../hr/_components/ActionForm";
import { badge, badgeBase, dateLabel, hoursLabel, monthLabel, sar, timeLabel } from "../hr/_components/format";
import { cancelLeaveAction, clockAction, requestLeaveAction } from "./actions";
import { getStaffLocale, getStaffT } from "../_i18n/display";
import { intlLocale } from "../_i18n/t";
import { translateStatus } from "../_ui/labels";

const STATUS_BADGE: Record<string, string> = {
  PENDING: badge.warn,
  APPROVED: badge.good,
  REJECTED: badge.bad,
  CANCELLED: badge.neutral,
};

export default async function MyTimePage() {
  const user = await requireAdmin();
  const [t, locale] = await Promise.all([getStaffT(), getStaffLocale()]);
  const today = todayISO();
  // My commission: this month so far and last month (hr/commission.ts — the
  // same figures payroll uses), only for staff on commission.
  const month = today.slice(0, 7);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const prevMonth = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const [me, balance, requests, payslips, rates] = await Promise.all([
    getMyAttendance(user.id),
    getLeaveBalance(user.id),
    listLeaveRequests({ userId: user.id }),
    listOwnPayslips(user.id),
    prisma.employeeRecord.findUnique({ where: { userId: user.id }, select: { commissionBp: true, productCommissionBp: true } }),
  ]);
  const onCommission = !!rates && (rates.commissionBp > 0 || rates.productCommissionBp > 0);
  const [thisMonth, lastMonth] = onCommission
    ? await Promise.all(
        [month, prevMonth].map(async (mm) => {
          const { from, to } = monthRange(mm);
          return summarize(await commissionLines(from, to, { staffUserId: user.id })).get(user.id) ?? null;
        }),
      )
    : [null, null];
  const SOURCE_LABEL: Record<CommissionSource, string> = { service: "Service", product: "Product", package: "Package session", refund: "Refund" };
  const dayFmt = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Asia/Riyadh", day: "numeric", month: "short" });

  return (
    <AdminShell user={user} title="My time & leave" description="Clock in and out, see your hours and request time off.">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        {/* Clock */}
        <section className="lunia-card flex flex-col items-center gap-4 p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-teal-ink)]">{dateLabel(today, locale)}</p>
          <p className="font-[family-name:var(--font-display)] text-3xl">
            {me.clockedIn ? t("On shift since {time}", { time: timeLabel(me.today.openSince, locale) }) : me.today.records.length ? t("Off shift") : t("Not clocked in yet")}
          </p>
          <ActionForm
            action={clockAction}
            submitLabel={me.clockedIn ? t("Clock out") : t("Clock in")}
            pendingLabel={t("One moment…")}
            className="flex w-full flex-col items-center gap-3"
            buttonClassName={`lunia-btn ${me.clockedIn ? "lunia-btn-ink" : "lunia-btn-primary"} w-full max-w-sm py-5 text-lg`}
          >
            <input type="hidden" name="direction" value={me.clockedIn ? "out" : "in"} />
          </ActionForm>
          {me.today.late && (
            <p className={`${badgeBase} ${badge.warn}`}>{t("Late today by {min} min", { min: me.today.lateByMin })}</p>
          )}
          {me.today.records.length > 0 && (
            <ul className="w-full max-w-sm divide-y divide-[var(--line)] text-sm">
              {me.today.records.map((r) => (
                <li key={r.id} className="flex justify-between py-2">
                  <span>{t("In {time}", { time: timeLabel(r.clockInAt, locale) })}</span>
                  <span>{r.clockOutAt ? t("Out {time}", { time: timeLabel(r.clockOutAt, locale) }) : translateStatus("Open", t)}</span>
                </li>
              ))}
            </ul>
          )}
          {me.missingOutCount > 0 && (
            <p className="text-sm text-red-700">
              {me.missingOutCount === 1
                ? t("1 earlier shift has no clock-out. Please tell HR so it can be corrected.")
                : t("{count} earlier shifts have no clock-out. Please tell HR so it can be corrected.", { count: me.missingOutCount })}
            </p>
          )}
        </section>

        {/* Month + balance */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="lunia-card p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-ink)]/55">{t("This month")}</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-3xl">{hoursLabel(me.monthWorkedMin, locale)}</p>
            <p className="mt-1 text-sm text-[var(--color-ink)]/60">
              {me.daysWorked === 1 ? t("1 day worked") : t("{count} days worked", { count: me.daysWorked })} · {t("{count} late", { count: me.lateDays })}
            </p>
          </div>
          <div className="lunia-card p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-ink)]/55">{t("Annual leave balance")}</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-3xl">{t("{count} days", { count: balance.balanceDays })}</p>
            <p className="mt-1 text-sm text-[var(--color-ink)]/60">
              {t("{annual} days a year · {used} used · {pending} pending", { annual: balance.annualDays, used: balance.usedDays, pending: balance.pendingDays })}
            </p>
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="lunia-card p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl">{t("Request leave")}</h2>
          <ActionForm action={requestLeaveAction} submitLabel={t("Send request")} pendingLabel={t("Sending…")} className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">{t("Type")}</span>
              <select name="type" defaultValue="ANNUAL" className="lunia-input min-h-11">
                {LEAVE_TYPES.map((lt) => (
                  <option key={lt} value={lt}>
                    {t(LEAVE_TYPE_LABELS[lt])}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">{t("From")}</span>
                <input type="date" name="startDateISO" required defaultValue={today} className="lunia-input min-h-11" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">{t("To (inclusive)")}</span>
                <input type="date" name="endDateISO" required defaultValue={today} className="lunia-input min-h-11" />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">{t("Reason (optional)")}</span>
              <textarea name="reason" rows={2} maxLength={500} className="lunia-input" />
            </label>
          </ActionForm>
        </section>

        <section className="lunia-card p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl">{t("My requests")}</h2>
          {requests.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-ink)]/60">{t("No leave requests yet.")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--line)]">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {t(LEAVE_TYPE_LABELS[r.type as LeaveType] ?? r.type)} · {t(r.days === 1 ? "{days} day" : "{days} days", { days: r.days })}
                    </p>
                    <p className="text-xs text-[var(--color-ink)]/60">
                      {t("{from} to {to}", { from: dateLabel(r.startDateISO, locale), to: dateLabel(r.endDateISO, locale) })}
                    </p>
                    {splitReason(r.reason).hrNote && (
                      <p className="text-xs text-[var(--color-ink)]/75">{t("HR note: {note}", { note: splitReason(r.reason).hrNote ?? "" })}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`${badgeBase} ${STATUS_BADGE[r.status] ?? badge.neutral}`}>{t(r.status.toLowerCase())}</span>
                    {r.status === "PENDING" && (
                      <ActionForm
                        action={cancelLeaveAction.bind(null, r.id)}
                        submitLabel={t("Cancel")}
                        pendingLabel="…"
                        buttonClassName="lunia-btn lunia-btn-ghost lunia-btn-sm"
                        confirmMessage={t("Cancel this leave request?")}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {onCommission && (
        <section className="lunia-card mt-6 flex flex-col gap-4 p-5" data-testid="my-commission">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-xl">{t("My commission")}</h2>
            <p className="text-xs text-[var(--color-ink)]/55">{t("On what customers paid, after discounts, excluding VAT. Final figures are on your payslip.")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-xs text-[var(--color-ink)]/55">{t("{month} so far", { month: monthLabel(month, locale) })}</p>
              <p className="mt-1 text-2xl tabular-nums" data-testid="my-commission-total">{sar(thisMonth?.commissionMinor ?? 0, locale)}</p>
            </div>
            <div className="rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-xs text-[var(--color-ink)]/55">{t("Services and package sessions")}</p>
              <p className="mt-1 text-lg tabular-nums">{sar(thisMonth?.servicesBaseMinor ?? 0, locale)}</p>
              <p className="text-xs text-[var(--color-ink)]/50">{t("at {pct}%", { pct: rates!.commissionBp / 100 })}</p>
            </div>
            <div className="rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-xs text-[var(--color-ink)]/55">{t("Products sold")}</p>
              <p className="mt-1 text-lg tabular-nums">{sar(thisMonth?.productsBaseMinor ?? 0, locale)}</p>
              <p className="text-xs text-[var(--color-ink)]/50">{t("at {pct}%", { pct: rates!.productCommissionBp / 100 })}</p>
            </div>
          </div>
          {thisMonth && thisMonth.lines.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="text-xs text-[var(--color-ink)]/55">
                    <th className="py-1.5 pe-3 text-start font-medium">{t("Date")}</th>
                    <th className="py-1.5 pe-3 text-start font-medium">{t("Customer")}</th>
                    <th className="py-1.5 pe-3 text-start font-medium">{t("Item")}</th>
                    <th className="py-1.5 pe-3 text-end font-medium">{t("Amount")}</th>
                    <th className="py-1.5 text-end font-medium">{t("Commission")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...thisMonth.lines].reverse().slice(0, 50).map((l, i) => (
                    <tr key={i} className="border-t border-[var(--line)]">
                      <td className="py-2 pe-3 tabular-nums">{dayFmt.format(l.at)}</td>
                      <td className="py-2 pe-3">{l.clientName ?? "—"}</td>
                      <td className="py-2 pe-3">
                        <span className="text-[var(--color-ink)]/55">{t(SOURCE_LABEL[l.source])} · </span>
                        {l.description}
                      </td>
                      <td className="py-2 pe-3 text-end tabular-nums">{sar(l.baseMinor, locale)}</td>
                      <td className="py-2 text-end tabular-nums">{sar(l.commissionMinor, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink)]/55">{t("Nothing yet this month — commission appears once a customer's invoice is fully paid.")}</p>
          )}
          <p className="text-xs text-[var(--color-ink)]/55">{t("Last month ({month}): {amount}", { month: monthLabel(prevMonth, locale), amount: sar(lastMonth?.commissionMinor ?? 0, locale) })}</p>
        </section>
      )}

      {payslips.length > 0 && (
        <section className="lunia-card mt-6 p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl">{t("My payslips")}</h2>
          <ul className="mt-3 divide-y divide-[var(--line)]">
            {payslips.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/admin/hr/payroll/${p.payrollRun.id}/${user.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm hover:text-[var(--color-teal-ink)]"
                >
                  <span className="font-medium">{monthLabel(p.payrollRun.periodMonth, locale)}</span>
                  <span>{t("{amount} net", { amount: sar(p.netMinor, locale) })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AdminShell>
  );
}
