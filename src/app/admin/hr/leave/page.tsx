import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { prisma } from "@/lib/db";
import { getLeaveBalance, listLeaveRequests, splitReason, upcomingAbsences } from "@/modules/hr/leave";
import { LEAVE_TYPE_LABELS, type LeaveType } from "@/modules/hr/constants";
import { todayISO } from "@/modules/hr/dates";
import { HrTabs } from "../_components/HrTabs";
import { badge, badgeBase, dateLabel, dayLabel, statusLabel, tCtx } from "../_components/format";
import { DecisionForm } from "./DecisionForm";
import { decideLeaveAction } from "./actions";
import { getStaffLocale } from "../../_i18n/display";
import { makeT } from "../../_i18n/t";

const STATUS_BADGE: Record<string, string> = {
  PENDING: badge.warn,
  APPROVED: badge.good,
  REJECTED: badge.bad,
  CANCELLED: badge.neutral,
};

const typeLabelEn = (type: string) => LEAVE_TYPE_LABELS[type as LeaveType] ?? type;

export default async function LeavePage() {
  const user = await requireAdmin(PERMISSIONS.HR_MANAGE);
  const locale = await getStaffLocale();
  const t = makeT(locale);
  // "Unpaid" elsewhere means an unpaid invoice; leave needs its own Arabic.
  const typeLabel = (type: string) => (type === "UNPAID" ? tCtx(t, typeLabelEn(type), "Unpaid (leave)") : t(typeLabelEn(type)));
  const today = todayISO();
  const [requests, absences, staff] = await Promise.all([
    listLeaveRequests(),
    upcomingAbsences(today, 30),
    prisma.user.findMany({
      where: { type: "STAFF", isActive: true },
      select: { id: true, email: true, staffProfile: { select: { fullName: true } } },
    }),
  ]);
  const nameOf = (u: { email: string | null; staffProfile: { fullName: string } | null }) => u.staffProfile?.fullName || u.email || t("Staff");

  const pending = requests.filter((r) => r.status === "PENDING").sort((a, b) => a.startDateISO.localeCompare(b.startDateISO));
  const decided = requests.filter((r) => r.status !== "PENDING").slice(0, 40);
  const approved = requests.filter((r) => r.status === "APPROVED");

  const balances = await Promise.all(
    staff.map(async (s) => ({ userId: s.id, name: nameOf(s), balance: await getLeaveBalance(s.id, today) })),
  );
  balances.sort((a, b) => a.name.localeCompare(b.name));
  const balanceById = new Map(balances.map((b) => [b.userId, b.balance]));

  return (
    <AdminShell user={user} title={tCtx(t, "Leave", "Leave (section)")} description="Approve requests, see who is off and track annual leave balances.">
      <HrTabs active="leave" />

      <section className="mb-8">
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl">
          {t("Waiting for approval")} {pending.length > 0 && <span className="text-[var(--color-ink)]/50">({pending.length})</span>}
        </h2>
        {pending.length === 0 ? (
          <p className="lunia-card p-5 text-sm text-[var(--color-ink)]/60">{t("Nothing waiting. New requests appear here and in the notification bell.")}</p>
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
                      {nameOf(r.user)} · {typeLabel(r.type)} · {t(r.days === 1 ? "{days} day" : "{days} days", { days: r.days })}
                    </p>
                    <p className="text-sm text-[var(--color-ink)]/65">
                      {t("{from} to {to}", { from: dateLabel(r.startDateISO, locale), to: dateLabel(r.endDateISO, locale) })}
                      {reason ? (locale === "ar" ? ` · «${reason}»` : ` · “${reason}”`) : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--color-ink)]/60">
                      {r.type === "ANNUAL" && bal && (
                        <span className={bal.remainingYearDays < 0 ? "font-semibold text-red-700" : ""}>
                          {t("Balance {accrued} days accrued · {left} left this service year", {
                            accrued: bal.balanceDays,
                            left: bal.annualDays - bal.usedDays,
                          })}
                        </span>
                      )}
                      {others.length > 0 && (
                        <span className="font-medium text-[var(--color-ink)]/75">
                          {t("Also off: {names}", { names: others.map((o) => nameOf(o.user)).join(locale === "ar" ? "، " : ", ") })}
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
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl">{t("Who is off (next 30 days)")}</h2>
          {absences.length === 0 ? (
            <p className="lunia-card p-5 text-sm text-[var(--color-ink)]/60">{t("Everyone is in.")}</p>
          ) : (
            <ul className="lunia-card divide-y divide-[var(--line)]">
              {absences.map((day) => (
                <li key={day.dateISO} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <span className="w-28 shrink-0 text-sm font-medium">{dayLabel(day.dateISO, locale)}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {day.people.map((p) => (
                      <span key={p.userId} className={`${badgeBase} ${p.status === "APPROVED" ? badge.good : badge.warn} normal-case tracking-normal`}>
                        {p.name} · {typeLabel(p.type)}
                        {p.status === "PENDING" ? ` ${t("(pending)")}` : ""}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl">{t("Annual leave balances")}</h2>
          <div className="overflow-x-auto lunia-card">
            <table className="w-full min-w-[480px] text-start text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.1em] text-[var(--color-ink)]/55">
                  <th className="px-4 py-3 font-semibold">{t("Employee")}</th>
                  <th className="px-4 py-3 text-end font-semibold">{t("Per year")}</th>
                  <th className="px-4 py-3 text-end font-semibold">{t("Accrued")}</th>
                  <th className="px-4 py-3 text-end font-semibold">{tCtx(t, "Used", "Used (leave)")}</th>
                  <th className="px-4 py-3 text-end font-semibold">{t("Balance")}</th>
                </tr>
              </thead>
              <tbody>
                {balances.map(({ userId, name, balance }) => (
                  <tr key={userId} className="border-t border-[var(--line)]">
                    <td className="px-4 py-3 font-medium">{name}</td>
                    <td className="px-4 py-3 text-end">{balance.annualDays}</td>
                    <td className="px-4 py-3 text-end">{balance.accruedDays}</td>
                    <td className="px-4 py-3 text-end">
                      {balance.usedDays}
                      {balance.pendingDays > 0 && <span className="text-[var(--color-ink)]/50"> +{balance.pendingDays}</span>}
                    </td>
                    <td className={`px-4 py-3 text-end font-semibold ${balance.balanceDays < 0 ? "text-red-700" : ""}`}>
                      {balance.balanceDays}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--color-ink)]/55">
            {t(
              "Accrued pro-rata over each employee's service year (21 days, 30 after five years). Used counts approved annual leave starting in the current service year; pending shown as +n.",
            )}
          </p>
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl">{t("Recent decisions")}</h2>
        {decided.length === 0 ? (
          <p className="text-sm text-[var(--color-ink)]/60">{t("None yet.")}</p>
        ) : (
          <ul className="lunia-card divide-y divide-[var(--line)]">
            {decided.map((r) => {
              const { reason, hrNote } = splitReason(r.reason);
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span>
                    <span className="font-medium">{nameOf(r.user)}</span> · {typeLabel(r.type)} ·{" "}
                    {t("{from} to {to} ({days}d)", { from: dateLabel(r.startDateISO, locale), to: dateLabel(r.endDateISO, locale), days: r.days })}
                    {reason ? (locale === "ar" ? ` · «${reason}»` : ` · “${reason}”`) : ""}
                    {hrNote && <span className="text-[var(--color-ink)]/60"> · {t("HR: {note}", { note: hrNote })}</span>}
                  </span>
                  <span className={`${badgeBase} ${STATUS_BADGE[r.status] ?? badge.neutral}`}>{statusLabel(r.status, locale)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
