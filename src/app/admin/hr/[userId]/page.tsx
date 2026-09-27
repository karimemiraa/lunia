import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { documentFlags, getEmployeeFile, monthlyFixedPayMinor } from "@/modules/hr/employees";
import { getLeaveBalance } from "@/modules/hr/leave";
import { CONTRACT_TYPES, CONTRACT_TYPE_LABELS } from "@/modules/hr/constants";
import { dateToISO } from "@/modules/hr/dates";
import { formatIban } from "@/modules/hr/iban";
import { computeGosi } from "@/modules/hr/payroll";
import { ActionForm } from "../_components/ActionForm";
import { badge, badgeBase, dateLabel, minorToInput, sar } from "../_components/format";
import { saveEmployeeAction } from "../actions";

interface PageProps {
  params: Promise<{ userId: string }>;
}

function Section({ title, children, hint }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="lunia-card p-5">
      <legend className="sr-only">{title}</legend>
      <h2 className="font-[family-name:var(--font-display)] text-xl">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-[var(--color-ink)]/55">{hint}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Input({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
  hint,
  inputMode,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
  placeholder?: string;
  hint?: string;
  inputMode?: "decimal" | "numeric" | "text";
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        inputMode={inputMode}
        className="lunia-input min-h-11"
      />
      {hint && <span className="text-xs text-[var(--color-ink)]/50">{hint}</span>}
    </label>
  );
}

function Check({ label, name, defaultChecked }: { label: string; name: string; defaultChecked: boolean }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-5 w-5 accent-[var(--color-forest)]" />
      {label}
    </label>
  );
}

export default async function EmployeeFilePage({ params }: PageProps) {
  const admin = await requireAdmin(PERMISSIONS.HR_MANAGE);
  const { userId } = await params;
  const user = await getEmployeeFile(userId);
  if (!user) notFound();

  const r = user.employeeRecord;
  const balance = await getLeaveBalance(userId);
  const flags = r ? documentFlags(r) : [];
  const name = user.staffProfile?.fullName || user.email || "Staff member";
  const gosi = r
    ? computeGosi({ isSaudi: r.isSaudi, gosiApplicable: r.gosiApplicable, basicMinor: r.basicSalaryMinor, housingMinor: r.housingAllowanceMinor })
    : null;

  return (
    <AdminShell
      user={admin}
      title={name}
      description={r ? "Employee file" : "No employee file yet. Fill in the details below to create one."}
      actions={
        <Link href="/admin/hr" className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
          All employees
        </Link>
      }
    >
      {flags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2" role="status">
          {flags.map((f) => (
            <span key={f.kind} className={`${badgeBase} ${f.status === "expired" ? badge.bad : badge.warn}`}>
              {f.label} {f.status === "expired" ? `expired ${dateLabel(f.expiryISO)}` : `expires ${dateLabel(f.expiryISO)} (${f.daysLeft} days)`}
            </span>
          ))}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="lunia-card p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-ink)]/55">Monthly fixed pay</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl">{sar(r ? monthlyFixedPayMinor(r) : 0)}</p>
          {gosi && (
            <p className="mt-1 text-xs text-[var(--color-ink)]/55">
              GOSI: employee {sar(gosi.employeeMinor)} · employer {sar(gosi.employerMinor)}
            </p>
          )}
        </div>
        <div className="lunia-card p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-ink)]/55">Annual leave entitlement</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl">{balance.annualDays} days / year</p>
          <p className="mt-1 text-xs text-[var(--color-ink)]/55">
            {balance.yearsOfService} full year{balance.yearsOfService === 1 ? "" : "s"} of service · statutory {balance.statutoryDays} days
            (30 after 5 years)
          </p>
        </div>
        <div className="lunia-card p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-ink)]/55">Leave balance</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl">{balance.balanceDays} days</p>
          <p className="mt-1 text-xs text-[var(--color-ink)]/55">
            Accrued {balance.accruedDays} · used {balance.usedDays} · pending {balance.pendingDays} (service year from{" "}
            {dateLabel(balance.serviceYearStartISO)})
          </p>
        </div>
      </div>

      <ActionForm action={saveEmployeeAction.bind(null, userId)} submitLabel="Save employee file" className="flex flex-col gap-5">
        <Section title="Identity">
          <Input label="Nationality" name="nationality" defaultValue={r?.nationality} placeholder="e.g. Saudi, Filipino" />
          <Check label="Saudi national (GOSI annuities apply)" name="isSaudi" defaultChecked={r?.isSaudi ?? false} />
          <Input label="National ID / Iqama no." name="nationalId" defaultValue={r?.nationalId} inputMode="numeric" hint="10 digits" />
          <Input label="ID / Iqama expiry" name="nationalIdExpiry" type="date" defaultValue={dateToISO(r?.nationalIdExpiry)} />
          <Input label="Passport no." name="passportNo" defaultValue={r?.passportNo} />
          <Input label="Passport expiry" name="passportExpiry" type="date" defaultValue={dateToISO(r?.passportExpiry)} />
        </Section>

        <Section title="Employment">
          <Input label="Employee no." name="employeeNo" defaultValue={r?.employeeNo} />
          <Input label="Job title" name="jobTitle" defaultValue={r?.jobTitle ?? user.staffProfile?.title} />
          <Input label="Department" name="department" defaultValue={r?.department} />
          <Input label="Hire date" name="hireDate" type="date" defaultValue={dateToISO(r?.hireDate)} />
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">Contract type</span>
            <select name="contractType" defaultValue={r?.contractType ?? ""} className="lunia-input min-h-11">
              <option value="">Not set</option>
              {CONTRACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CONTRACT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <Input label="Contract end" name="contractEnd" type="date" defaultValue={dateToISO(r?.contractEnd)} hint="Leave empty for open-ended" />
        </Section>

        <Section title="Pay" hint="Monthly amounts in SAR. GOSI is calculated on basic + housing.">
          <Input label="Basic salary" name="basicSalaryMinor" defaultValue={r ? minorToInput(r.basicSalaryMinor) : ""} inputMode="decimal" />
          <Input label="Housing allowance" name="housingAllowanceMinor" defaultValue={r ? minorToInput(r.housingAllowanceMinor) : ""} inputMode="decimal" />
          <Input label="Transport allowance" name="transportAllowanceMinor" defaultValue={r ? minorToInput(r.transportAllowanceMinor) : ""} inputMode="decimal" />
          <Input label="Other allowances" name="otherAllowanceMinor" defaultValue={r ? minorToInput(r.otherAllowanceMinor) : ""} inputMode="decimal" />
          <Input
            label="Commission (%)"
            name="commissionPct"
            defaultValue={r && r.commissionBp ? String(r.commissionBp / 100) : ""}
            inputMode="decimal"
            hint="Of revenue from their completed appointments"
          />
          <Check label="GOSI applies" name="gosiApplicable" defaultChecked={r?.gosiApplicable ?? true} />
          <Input
            label="IBAN"
            name="iban"
            defaultValue={r?.iban ? formatIban(r.iban) : ""}
            placeholder="SA00 0000 0000 0000 0000 0000"
            hint="Saudi IBAN: SA + 22 digits"
          />
          <Input label="Bank name" name="bankName" defaultValue={r?.bankName} />
        </Section>

        <Section title="Leave & contacts">
          <Input
            label="Annual leave days (contract)"
            name="annualLeaveDays"
            type="number"
            defaultValue={String(r?.annualLeaveDays ?? 21)}
            hint="Minimum 21; raised to 30 automatically after 5 years of service"
          />
          <Input label="Emergency contact" name="emergencyContact" defaultValue={r?.emergencyContact} placeholder="Name, relation, phone" />
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">Notes</span>
            <textarea name="notes" rows={4} defaultValue={r?.notes ?? ""} className="lunia-input" />
          </label>
        </Section>
      </ActionForm>
    </AdminShell>
  );
}
