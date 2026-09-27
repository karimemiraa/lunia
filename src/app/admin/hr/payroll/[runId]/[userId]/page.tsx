import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "../../../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getPayslip, grossMinor, isEditable } from "@/modules/hr/payroll";
import { formatIban } from "@/modules/hr/iban";
import { dateToISO, todayISO } from "@/modules/hr/dates";
import { dateLabel, monthLabel, sar } from "../../../_components/format";
import { PrintButton } from "./PrintButton";

interface PageProps {
  params: Promise<{ runId: string; userId: string }>;
}

// A printable, bilingual (English / Arabic) payslip. Rendered without the
// admin shell so it prints cleanly. HR sees every payslip; a staff member may
// open their own once the run is approved.
function Row({ en, ar, value, strong }: { en: string; ar: string; value: string; strong?: boolean }) {
  return (
    <tr className={`border-t border-[var(--line)] ${strong ? "font-semibold" : ""}`}>
      <td className="py-2 pe-3">{en}</td>
      <td className="py-2 pe-3 text-end tabular-nums">{value}</td>
      <td className="py-2 text-end" dir="rtl" lang="ar">
        {ar}
      </td>
    </tr>
  );
}

export default async function PayslipPage({ params }: PageProps) {
  const viewer = await requireAdmin();
  const { runId, userId } = await params;
  const slip = await getPayslip(runId, userId);
  if (!slip) notFound();

  const isHr = viewer.permissions.has(PERMISSIONS.HR_MANAGE);
  if (!isHr && !(viewer.id === userId && !isEditable(slip.payrollRun.status))) redirect("/admin");

  const r = slip.user.employeeRecord;
  const name = slip.user.staffProfile?.fullName || slip.user.email || "Staff";
  const gross = grossMinor(slip);
  const totalDeductions = slip.deductionsMinor + slip.gosiEmployeeMinor;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:p-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={isHr ? `/admin/hr/payroll/${runId}` : "/admin/me"} className="lunia-btn lunia-btn-ghost min-h-11">
          Back
        </Link>
        <PrintButton />
      </div>

      <article className="lunia-card p-8 print:border-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-[var(--line)] pb-5">
          <div>
            <p className="font-[family-name:var(--font-display)] text-3xl">Lunia</p>
            <p className="text-sm text-[var(--color-ink)]/60">Skin Quality Center · Riyadh</p>
          </div>
          <div className="text-end">
            <p className="font-medium">
              Payslip <span dir="rtl" lang="ar">· قسيمة الراتب</span>
            </p>
            <p className="text-sm text-[var(--color-ink)]/60">{monthLabel(slip.payrollRun.periodMonth)}</p>
            {isEditable(slip.payrollRun.status) && <p className="mt-1 text-xs font-semibold uppercase text-red-700">Draft</p>}
          </div>
        </header>

        <dl className="grid gap-x-8 gap-y-2 py-5 text-sm sm:grid-cols-2">
          {(
            [
              ["Employee", "الموظف", name],
              ["Employee no.", "الرقم الوظيفي", r?.employeeNo ?? "—"],
              ["Job title", "المسمى الوظيفي", r?.jobTitle ?? "—"],
              ["Department", "القسم", r?.department ?? "—"],
              [r?.isSaudi ? "National ID" : "Iqama no.", r?.isSaudi ? "رقم الهوية" : "رقم الإقامة", r?.nationalId ?? "—"],
              ["Hire date", "تاريخ التعيين", dateLabel(dateToISO(r?.hireDate))],
              ["Bank", "البنك", r?.bankName ?? "—"],
              ["IBAN", "الآيبان", r?.iban ? formatIban(r.iban) : "—"],
            ] as const
          ).map(([en, ar, value]) => (
            <div key={en} className="flex justify-between gap-3 border-b border-dashed border-[var(--line)] pb-1">
              <dt className="text-[var(--color-ink)]/60">
                {en} <span dir="rtl" lang="ar" className="text-[var(--color-ink)]/45">/ {ar}</span>
              </dt>
              <dd className="text-end font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-[0.12em] text-[var(--color-ink)]/55">
              <th className="pb-2 text-start font-semibold">Earnings</th>
              <th className="pb-2 text-end font-semibold">SAR</th>
              <th className="pb-2 text-end font-semibold" dir="rtl" lang="ar">
                المستحقات
              </th>
            </tr>
          </thead>
          <tbody>
            <Row en="Basic salary" ar="الراتب الأساسي" value={sar(slip.basicMinor)} />
            <Row en="Housing allowance" ar="بدل السكن" value={sar(slip.housingMinor)} />
            <Row en="Transport allowance" ar="بدل النقل" value={sar(slip.transportMinor)} />
            {slip.otherAllowMinor > 0 && <Row en="Other allowances" ar="بدلات أخرى" value={sar(slip.otherAllowMinor)} />}
            {slip.commissionMinor > 0 && <Row en="Commission" ar="العمولة" value={sar(slip.commissionMinor)} />}
            {slip.overtimeMinor > 0 && <Row en="Overtime" ar="العمل الإضافي" value={sar(slip.overtimeMinor)} />}
            {slip.bonusMinor > 0 && <Row en="Bonus" ar="مكافأة" value={sar(slip.bonusMinor)} />}
            <Row en="Gross pay" ar="إجمالي المستحقات" value={sar(gross)} strong />
          </tbody>
        </table>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-[0.12em] text-[var(--color-ink)]/55">
              <th className="pb-2 text-start font-semibold">Deductions</th>
              <th className="pb-2 text-end font-semibold">SAR</th>
              <th className="pb-2 text-end font-semibold" dir="rtl" lang="ar">
                الاستقطاعات
              </th>
            </tr>
          </thead>
          <tbody>
            <Row en="GOSI (employee share)" ar="التأمينات الاجتماعية (حصة الموظف)" value={sar(slip.gosiEmployeeMinor)} />
            {slip.deductionsMinor > 0 && <Row en="Other deductions" ar="استقطاعات أخرى" value={sar(slip.deductionsMinor)} />}
            <Row en="Total deductions" ar="إجمالي الاستقطاعات" value={sar(totalDeductions)} strong />
          </tbody>
        </table>

        <div className="mt-6 flex items-center justify-between rounded-[var(--radius)] bg-[var(--surface-2)] px-5 py-4">
          <span className="font-medium">
            Net pay <span dir="rtl" lang="ar">/ صافي الراتب</span>
          </span>
          <span className="font-[family-name:var(--font-display)] text-2xl tabular-nums">{sar(slip.netMinor)}</span>
        </div>

        {slip.notes && <p className="mt-4 text-sm text-[var(--color-ink)]/65">Notes: {slip.notes}</p>}
        <p className="mt-6 text-xs text-[var(--color-ink)]/50">
          Employer GOSI contribution (not deducted from pay): {sar(slip.gosiEmployerMinor)}.
          {slip.payrollRun.paidAt ? ` Paid ${dateLabel(todayISO(slip.payrollRun.paidAt))}.` : ""}
        </p>
      </article>
    </main>
  );
}
