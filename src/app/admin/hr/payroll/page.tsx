import Link from "next/link";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listPayrollRuns } from "@/modules/hr/payroll";
import { GOSI_RATES_AS_OF } from "@/modules/hr/constants";
import { todayISO } from "@/modules/hr/dates";
import { HrTabs } from "../_components/HrTabs";
import { ActionForm } from "../_components/ActionForm";
import { badgeBase, monthLabel, payrollStatusBadge, sar } from "../_components/format";
import { createRunAction } from "./actions";

export default async function PayrollPage() {
  const user = await requireAdmin(PERMISSIONS.HR_MANAGE);
  const runs = await listPayrollRuns();
  const thisMonth = todayISO().slice(0, 7);

  return (
    <AdminShell user={user} title="Payroll" description="Monthly payroll runs: draft, approve, pay, and export the bank transfer file.">
      <HrTabs active="payroll" />

      <section className="lunia-card mb-6 p-5">
        <h2 className="font-[family-name:var(--font-display)] text-xl">New payroll run</h2>
        <p className="mt-1 text-sm text-[var(--color-ink)]/60">
          Creates a draft payslip for every active employee with a file: fixed pay, commission on completed appointments,
          suggested unpaid-leave deduction and GOSI (rates as of {GOSI_RATES_AS_OF}).
        </p>
        <ActionForm action={createRunAction} submitLabel="Create draft run" pendingLabel="Calculating…" className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">Month</span>
            <input type="month" name="month" required defaultValue={thisMonth} className="lunia-input min-h-11" />
          </label>
        </ActionForm>
      </section>

      {runs.length === 0 ? (
        <p className="text-sm text-[var(--color-ink)]/60">No payroll runs yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {runs.map((run) => (
            <li key={run.id}>
              <Link href={`/admin/hr/payroll/${run.id}`} className="lunia-card flex min-h-11 flex-wrap items-center justify-between gap-3 p-4 hover:bg-[var(--color-teal)]/[0.05]">
                <span className="flex items-center gap-3">
                  <span className="font-[family-name:var(--font-display)] text-xl">{monthLabel(run.periodMonth)}</span>
                  <span className={`${badgeBase} ${payrollStatusBadge(run.status)}`}>{run.status.toLowerCase()}</span>
                </span>
                <span className="text-sm text-[var(--color-ink)]/70">
                  {run._count.payslips} payslip{run._count.payslips === 1 ? "" : "s"} · <span className="font-medium text-[var(--color-ink)]">{sar(run.totalNetMinor)}</span> net
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
