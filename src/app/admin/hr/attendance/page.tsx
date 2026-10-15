import Link from "next/link";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getAttendanceGrid, getMonthlySummary, type DaySummary } from "@/modules/hr/attendance";
import { addDays, isDateISO, isMonthISO, todayISO, weekStart } from "@/modules/hr/dates";
import { HrTabs } from "../_components/HrTabs";
import { ActionForm } from "../_components/ActionForm";
import { badge, badgeBase, dayLabel, dateLabel, hoursLabel, monthLabel, tCtx, timeInput, timeLabel } from "../_components/format";
import { deleteAttendanceAction, saveAttendanceAction } from "./actions";
import { getStaffLocale } from "../../_i18n/display";
import { makeT, type T } from "../../_i18n/t";

interface PageProps {
  searchParams: Promise<{ view?: string; date?: string; month?: string }>;
}

const VIEWS = ["day", "week", "month"] as const;
type View = (typeof VIEWS)[number];

function DayBadges({ day, t }: { day: DaySummary; t: T }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {day.late && <span className={`${badgeBase} ${badge.warn}`}>{t("Late {min}m", { min: day.lateByMin })}</span>}
      {day.missingOut && <span className={`${badgeBase} ${badge.bad}`}>{t("No clock-out")}</span>}
      {day.openSince && <span className={`${badgeBase} ${badge.good}`}>{t("On shift")}</span>}
    </span>
  );
}

function RecordFields({
  staff,
  defaults,
  t,
}: {
  t: T;
  staff: { userId: string; name: string }[];
  defaults: { id?: string; userId?: string; dateISO: string; clockIn?: string; clockOut?: string; note?: string };
}) {
  return (
    <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {defaults.id ? (
        <input type="hidden" name="userId" value={defaults.userId} />
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-[var(--color-ink)]/60">{t("Employee")}</span>
          <select name="userId" required defaultValue={defaults.userId ?? ""} className="lunia-input min-h-11">
            <option value="" disabled>
              {t("Choose…")}
            </option>
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs uppercase tracking-[0.12em] text-[var(--color-ink)]/60">{t("Date")}</span>
        <input type="date" name="dateISO" required defaultValue={defaults.dateISO} className="lunia-input min-h-11" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs uppercase tracking-[0.12em] text-[var(--color-ink)]/60">{tCtx(t, "In", "In (attendance)")}</span>
        <input type="time" name="clockIn" required defaultValue={defaults.clockIn} className="lunia-input min-h-11" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs uppercase tracking-[0.12em] text-[var(--color-ink)]/60">{tCtx(t, "Out", "Out (attendance)")}</span>
        <input type="time" name="clockOut" defaultValue={defaults.clockOut} className="lunia-input min-h-11" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs uppercase tracking-[0.12em] text-[var(--color-ink)]/60">{t("Note (required)")}</span>
        <input name="note" required minLength={3} defaultValue={defaults.note} placeholder={t("Why the correction")} className="lunia-input min-h-11" />
      </label>
    </div>
  );
}

export default async function AttendancePage({ searchParams }: PageProps) {
  const user = await requireAdmin(PERMISSIONS.HR_MANAGE);
  const locale = await getStaffLocale();
  const t = makeT(locale);
  const params = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(params.view ?? "") ? (params.view as View) : "day";
  const today = todayISO();
  const date = params.date && isDateISO(params.date) ? params.date : today;
  const month = params.month && isMonthISO(params.month) ? params.month : date.slice(0, 7);

  const from = view === "week" ? weekStart(date) : date;
  const grid = view === "month" ? null : await getAttendanceGrid(from, view === "week" ? 7 : 1);
  const summary = view === "month" ? await getMonthlySummary(month) : null;
  const staffOptions = (grid?.staff ?? summary ?? []).map((s) => ({ userId: s.userId, name: s.name }));

  const step = view === "week" ? 7 : 1;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const shiftMonth = (delta: number) => new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);

  const viewLink = (v: View) => `/admin/hr/attendance?view=${v}&date=${date}${v === "month" ? `&month=${month}` : ""}`;

  return (
    <AdminShell
      user={user}
      title="Attendance"
      description="Clock records per employee, lateness against their schedule (10-minute grace) and missing clock-outs."
      actions={
        <a href={`/admin/hr/attendance/export?month=${month}`} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
          {t("Export {month} CSV", { month: monthLabel(month, locale) })}
        </a>
      }
    >
      <HrTabs active="attendance" />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={viewLink(v)}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm capitalize ${
              v === view ? "bg-[var(--color-teal)] text-[var(--color-ink)]" : "border border-[var(--line-strong)] text-[var(--color-ink)]/70"
            }`}
          >
            {v === "month" ? t("Monthly summary") : t(v)}
          </Link>
        ))}
        <span className="mx-2 h-6 w-px bg-[var(--line-strong)]" aria-hidden="true" />
        {view === "month" ? (
          <>
            <Link href={`/admin/hr/attendance?view=month&month=${shiftMonth(-1)}`} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
              {t("Previous")}
            </Link>
            <span className="px-2 text-sm font-medium">{monthLabel(month, locale)}</span>
            <Link href={`/admin/hr/attendance?view=month&month=${shiftMonth(1)}`} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
              {t("Next")}
            </Link>
          </>
        ) : (
          <>
            <Link href={`/admin/hr/attendance?view=${view}&date=${addDays(date, -step)}`} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
              {t("Previous")}
            </Link>
            <span className="px-2 text-sm font-medium">
              {view === "week" ? t("Week of {date}", { date: dateLabel(from, locale) }) : dateLabel(date, locale)}
            </span>
            <Link href={`/admin/hr/attendance?view=${view}&date=${addDays(date, step)}`} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
              {t("Next")}
            </Link>
            {date !== today && (
              <Link href={`/admin/hr/attendance?view=${view}`} className="text-sm underline underline-offset-4">
                {t("Today")}
              </Link>
            )}
          </>
        )}
      </div>

      {view === "day" && grid && (
        <div className="flex flex-col gap-3">
          {grid.staff.map((s) => {
            const day = s.days[0]!;
            return (
              <div key={s.userId} className="lunia-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-sm text-[var(--color-ink)]/60">
                      {day.records.length
                        ? t("In {in} · Out {out} · {hours}", {
                            in: timeLabel(day.firstIn, locale),
                            out: timeLabel(day.lastOut, locale),
                            hours: hoursLabel(day.workedMin, locale),
                          })
                        : day.scheduled
                          ? t("Scheduled, no clock-in")
                          : t("Not scheduled")}
                    </p>
                  </div>
                  <DayBadges day={day} t={t} />
                </div>
                {day.records.length > 0 && (
                  <details className="mt-3">
                    <summary className="min-h-11 cursor-pointer py-2 text-sm text-[var(--color-teal-ink)]">
                      {t(day.records.length === 1 ? "{count} record · correct" : "{count} records · correct", { count: day.records.length })}
                    </summary>
                    <div className="mt-2 flex flex-col gap-4">
                      {day.records.map((r) => (
                        <div key={r.id} className="rounded-[var(--radius)] border border-[var(--line)] p-3">
                          <p className="mb-2 text-xs text-[var(--color-ink)]/55">
                            {r.source === "MANUAL" ? t("Manual entry") : t("Self clock")}
                            {r.note ? ` · ${r.note}` : ""}
                          </p>
                          <ActionForm action={saveAttendanceAction} submitLabel={t("Save correction")} buttonClassName="lunia-btn lunia-btn-forest lunia-btn-sm">
                            <RecordFields
                              t={t}
                              staff={staffOptions}
                              defaults={{
                                id: r.id,
                                userId: r.userId,
                                dateISO: r.dateISO,
                                clockIn: timeInput(r.clockInAt),
                                clockOut: timeInput(r.clockOutAt),
                                note: r.note ?? "",
                              }}
                            />
                          </ActionForm>
                          <div className="mt-2">
                            <ActionForm
                              action={deleteAttendanceAction.bind(null, r.id)}
                              submitLabel={t("Delete record")}
                              pendingLabel={t("Deleting…")}
                              buttonClassName="lunia-btn lunia-btn-danger lunia-btn-sm"
                              confirmMessage={t("Delete this clock record?")}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === "week" && grid && (
        <div className="overflow-x-auto lunia-card">
          <table className="w-full min-w-[760px] text-start text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.1em] text-[var(--color-ink)]/55">
                <th className="sticky start-0 bg-[var(--surface-2)] px-3 py-3 font-semibold">{t("Employee")}</th>
                {grid.dates.map((d) => (
                  <th key={d} className="px-3 py-3 font-semibold">
                    <Link href={`/admin/hr/attendance?view=day&date=${d}`} className="hover:underline">
                      {dayLabel(d, locale)}
                    </Link>
                  </th>
                ))}
                <th className="px-3 py-3 text-end font-semibold">{t("Total")}</th>
              </tr>
            </thead>
            <tbody>
              {grid.staff.map((s) => (
                <tr key={s.userId} className="border-t border-[var(--line)] align-top">
                  <td className="sticky start-0 bg-[var(--surface)] px-3 py-3 font-medium">{s.name}</td>
                  {s.days.map((d) => (
                    <td key={d.dateISO} className="px-3 py-3">
                      {d.records.length ? (
                        <div className="flex flex-col gap-1">
                          <span>
                            {timeLabel(d.firstIn, locale)}–{timeLabel(d.lastOut, locale)}
                          </span>
                          <span className="text-xs text-[var(--color-ink)]/60">{hoursLabel(d.workedMin, locale)}</span>
                          <DayBadges day={d} t={t} />
                        </div>
                      ) : (
                        <span className="text-[var(--color-ink)]/35">{d.scheduled ? t("Absent") : "—"}</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-end font-medium">{hoursLabel(s.workedMin, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "month" && summary && (
        <div className="overflow-x-auto lunia-card">
          <table className="w-full min-w-[560px] text-start text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.1em] text-[var(--color-ink)]/55">
                <th className="px-4 py-3 font-semibold">{t("Employee")}</th>
                <th className="px-4 py-3 text-end font-semibold">{t("Days worked")}</th>
                <th className="px-4 py-3 text-end font-semibold">{t("Scheduled days")}</th>
                <th className="px-4 py-3 text-end font-semibold">{t("Hours")}</th>
                <th className="px-4 py-3 text-end font-semibold">{t("Late")}</th>
                <th className="px-4 py-3 text-end font-semibold">{t("Missing clock-outs")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.userId} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-end">{s.daysWorked}</td>
                  <td className="px-4 py-3 text-end">{s.scheduledDays}</td>
                  <td className="px-4 py-3 text-end">{hoursLabel(s.workedMin, locale)}</td>
                  <td className="px-4 py-3 text-end">{s.lateCount}</td>
                  <td className={`px-4 py-3 text-end ${s.missingOutCount ? "font-semibold text-red-700" : ""}`}>{s.missingOutCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view !== "month" && (
        <details className="lunia-card mt-6 p-5">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">{t("Add a manual record")}</summary>
          <ActionForm action={saveAttendanceAction} submitLabel={t("Add record")} className="mt-3">
            <RecordFields t={t} staff={staffOptions} defaults={{ dateISO: date }} />
          </ActionForm>
        </details>
      )}
    </AdminShell>
  );
}
