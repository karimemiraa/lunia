import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../../_components/requireAdmin";
import { AdminShell } from "../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getPayrollRun, grossMinor, isEditable, suggestedUnpaidDeduction } from "@/modules/hr/payroll";
import { HrTabs } from "../../_components/HrTabs";
import { ActionForm } from "../../_components/ActionForm";
import { badgeBase, minorToInput, monthLabel, payrollStatusBadge, sar } from "../../_components/format";
import { approveRunAction, deleteRunAction, markPaidAction, recalculateRunAction, updatePayslipAction } from "../actions";

interface PageProps {
  params: Promise<{ runId: string }>;
}

const dtFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-[var(--color-ink)]/60">{label}</span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}

export default async function PayrollRunPage({ params }: PageProps) {
  const user = await requireAdmin(PERMISSIONS.HR_MANAGE);
  const { runId } = await params;
  const run = await getPayrollRun(runId);
  if (!run) notFound();

  const editable = isEditable(run.status);
  const slips = [...run.payslips].sort((a, b) =>
    (a.user.staffProfile?.fullName ?? "").localeCompare(b.user.staffProfile?.fullName ?? ""),
  );
  const suggestions = editable
    ? new Map(
        await Promise.all(
          slips
            .filter((s) => s.user.employeeRecord)
            .map(async (s) => [s.userId, await suggestedUnpaidDeduction(s.user.employeeRecord!, run.periodMonth)] as const),
        ),
      )
    : new Map<string, { days: number; amountMinor: number }>();

  const sum = (pick: (s: (typeof slips)[number]) => number) => slips.reduce((t, s) => t + pick(s), 0);
  const totalGross = sum((s) => grossMinor(s));
  const totalDeductions = sum((s) => s.deductionsMinor);
  const totalGosiEmployee = sum((s) => s.gosiEmployeeMinor);
  const totalGosiEmployer = sum((s) => s.gosiEmployerMinor);
  const totalNet = sum((s) => s.netMinor);

  return (
    <AdminShell
      user={user}
      title={`Payroll · ${monthLabel(run.periodMonth)}`}
      description={
        run.status === "DRAFT"
          ? "Draft: edit overtime, bonus and deductions, recalculate, then approve to lock it."
          : run.status === "APPROVED"
            ? `Approved ${run.approvedAt ? dtFmt.format(run.approvedAt) : ""}. Locked; export the bank file and mark it paid once transferred.`
            : `Paid ${run.paidAt ? dtFmt.format(run.paidAt) : ""}.`
      }
      actions={
        <Link href="/admin/hr/payroll" className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
          All runs
        </Link>
      }
    >
      <HrTabs active="payroll" />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <section className="lunia-card flex flex-col gap-2 p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-xl">Run totals</h2>
            <span className={`${badgeBase} ${payrollStatusBadge(run.status)}`}>{run.status.toLowerCase()}</span>
          </div>
          <Line label="Employees" value={String(slips.length)} />
          <Line label="Gross pay" value={sar(totalGross)} />
          <Line label="Deductions" value={sar(totalDeductions)} />
          <Line label="GOSI (employee share)" value={sar(totalGosiEmployee)} />
          <Line label="Net to transfer" value={sar(totalNet)} strong />
          <Line label="GOSI (employer share)" value={sar(totalGosiEmployer)} />
          <Line label="Total employer cost" value={sar(totalGross + totalGosiEmployer)} strong />
        </section>

        <section className="lunia-card flex flex-col gap-3 p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl">Actions</h2>
          {editable && (
            <>
              <ActionForm action={recalculateRunAction.bind(null, run.id)} submitLabel="Recalculate from employee files" pendingLabel="Recalculating…" buttonClassName="lunia-btn lunia-btn-ghost" />
              <ActionForm
                action={approveRunAction.bind(null, run.id)}
                submitLabel="Approve and lock"
                pendingLabel="Approving…"
                confirmMessage={`Approve payroll for ${monthLabel(run.periodMonth)}? Payslips can no longer be edited afterwards.`}
              />
              <ActionForm
                action={deleteRunAction.bind(null, run.id)}
                submitLabel="Delete draft"
                pendingLabel="Deleting…"
                buttonClassName="lunia-btn lunia-btn-danger lunia-btn-sm"
                confirmMessage="Delete this draft run and all its payslips?"
              />
            </>
          )}
          {!editable && (
            <a href={`/admin/hr/payroll/${run.id}/bank`} className="lunia-btn lunia-btn-forest-outline min-h-11 self-start">
              Download bank transfer file (CSV)
            </a>
          )}
          {run.status === "APPROVED" && (
            <ActionForm
              action={markPaidAction.bind(null, run.id)}
              submitLabel="Mark as paid"
              pendingLabel="Saving…"
              confirmMessage="Confirm the salaries have been transferred?"
            />
          )}
        </section>
      </div>

      <div className="flex flex-col gap-4">
        {slips.map((s) => {
          const name = s.user.staffProfile?.fullName || s.user.email || "Staff";
          const suggestion = suggestions.get(s.userId);
          const r = s.user.employeeRecord;
          return (
            <article key={s.id} className="lunia-card p-5">
              <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-medium">{name}</h3>
                  <p className="text-xs text-[var(--color-ink)]/55">
                    {[r?.jobTitle, r?.isSaudi ? "Saudi" : r?.nationality].filter(Boolean).join(" · ")}
                    {!r?.iban && <span className="ms-2 font-semibold text-red-700">No IBAN on file</span>}
                  </p>
                </div>
                <Link href={`/admin/hr/payroll/${run.id}/${s.userId}`} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
                  Payslip
                </Link>
              </header>

              <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                <Line label="Basic" value={sar(s.basicMinor)} />
                <Line label="Housing" value={sar(s.housingMinor)} />
                <Line label="Transport" value={sar(s.transportMinor)} />
                <Line label="Other allowances" value={sar(s.otherAllowMinor)} />
                <Line label="Commission" value={sar(s.commissionMinor)} />
                <Line label="GOSI employee / employer" value={`${sar(s.gosiEmployeeMinor)} / ${sar(s.gosiEmployerMinor)}`} />
                {!editable && (
                  <>
                    <Line label="Overtime" value={sar(s.overtimeMinor)} />
                    <Line label="Bonus" value={sar(s.bonusMinor)} />
                    <Line label="Deductions" value={sar(s.deductionsMinor)} />
                  </>
                )}
                <Line label="Net pay" value={sar(s.netMinor)} strong />
              </div>
              {!editable && s.notes && <p className="mt-2 text-sm text-[var(--color-ink)]/60">{s.notes}</p>}

              {editable && (
                <ActionForm
                  action={updatePayslipAction.bind(null, run.id, s.id)}
                  submitLabel="Save"
                  buttonClassName="lunia-btn lunia-btn-forest lunia-btn-sm"
                  className="mt-4 border-t border-[var(--line)] pt-4"
                >
                  <div className="mb-3 grid gap-3 sm:grid-cols-3">
                    {(
                      [
                        ["overtime", "Overtime (SAR)", s.overtimeMinor],
                        ["bonus", "Bonus (SAR)", s.bonusMinor],
                        ["deductions", "Deductions (SAR)", s.deductionsMinor],
                      ] as const
                    ).map(([field, label, value]) => (
                      <label key={field} className="flex flex-col gap-1 text-sm">
                        <span className="text-xs uppercase tracking-[0.12em] text-[var(--color-ink)]/60">{label}</span>
                        <input name={field} inputMode="decimal" defaultValue={minorToInput(value)} className="lunia-input min-h-11" />
                      </label>
                    ))}
                    <label className="flex flex-col gap-1 text-sm sm:col-span-3">
                      <span className="text-xs uppercase tracking-[0.12em] text-[var(--color-ink)]/60">Notes</span>
                      <input name="notes" maxLength={500} defaultValue={s.notes ?? ""} className="lunia-input min-h-11" />
                    </label>
                  </div>
                  {suggestion && suggestion.days > 0 && (
                    <p className="mb-3 text-xs text-[var(--color-ink)]/65">
                      Suggested unpaid-leave deduction: {suggestion.days} day{suggestion.days === 1 ? "" : "s"} × daily rate ={" "}
                      <span className="font-semibold">{sar(suggestion.amountMinor)}</span>
                    </p>
                  )}
                </ActionForm>
              )}
            </article>
          );
        })}
        {slips.length === 0 && (
          <p className="text-sm text-[var(--color-ink)]/60">No employees with a file were active in this month. Add employee files, then recalculate.</p>
        )}
      </div>
    </AdminShell>
  );
}
