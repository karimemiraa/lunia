import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listEmployees, type DocumentFlag } from "@/modules/hr/employees";
import { HrTabs } from "./_components/HrTabs";
import { badge, badgeBase, dateLabel, sar } from "./_components/format";

function Flags({ flags }: { flags: DocumentFlag[] }) {
  if (!flags.length) return <span className="text-[var(--color-ink)]/40">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f.kind} className={`${badgeBase} ${f.status === "expired" ? badge.bad : badge.warn}`}>
          {f.label} {f.status === "expired" ? "expired" : `${f.daysLeft}d`}
        </span>
      ))}
    </div>
  );
}

export default async function EmployeesPage() {
  const user = await requireAdmin(PERMISSIONS.HR_MANAGE);
  const employees = await listEmployees();
  const withFile = employees.filter((e) => e.hasFile);
  const monthlyTotal = withFile.filter((e) => e.isActive).reduce((s, e) => s + e.salaryTotalMinor, 0);
  const flagged = employees.filter((e) => e.flags.length).length;

  return (
    <AdminShell user={user} title="Employees" description="Employee files: identity documents, contracts and pay.">
      <HrTabs active="employees" />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="lunia-card p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-ink)]/55">Staff</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl">
            {employees.filter((e) => e.isActive).length} active · {withFile.length} with a file
          </p>
        </div>
        <div className="lunia-card p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-ink)]/55">Monthly fixed pay</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl">{sar(monthlyTotal)}</p>
        </div>
        <div className="lunia-card p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-ink)]/55">Documents needing attention</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl">{flagged}</p>
        </div>
      </div>

      {/* Cards on phones / narrow iPad, table from lg up. */}
      <div className="flex flex-col gap-3 lg:hidden">
        {employees.map((e) => (
          <Link key={e.userId} href={`/admin/hr/${e.userId}`} className="lunia-card block p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {e.fullName}
                  {!e.isActive && <span className={`${badgeBase} ${badge.neutral} ms-2`}>Inactive</span>}
                </p>
                <p className="text-sm text-[var(--color-ink)]/60">
                  {[e.jobTitle, e.department].filter(Boolean).join(" · ") || "No job details yet"}
                </p>
              </div>
              {e.hasFile ? (
                <span className="shrink-0 text-sm font-medium">{sar(e.salaryTotalMinor)}</span>
              ) : (
                <span className={`${badgeBase} ${badge.warn} shrink-0`}>No file</span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-ink)]/60">
              <span>{e.nationality ?? "Nationality —"}</span>
              <span>Hired {dateLabel(e.hireDateISO)}</span>
            </div>
            {e.flags.length > 0 && (
              <div className="mt-2">
                <Flags flags={e.flags} />
              </div>
            )}
          </Link>
        ))}
      </div>

      <div className="hidden overflow-x-auto lunia-card lg:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.1em] text-[var(--color-ink)]/55">
              <th className="px-4 py-3 font-semibold">Employee</th>
              <th className="px-4 py-3 font-semibold">Job title</th>
              <th className="px-4 py-3 font-semibold">Department</th>
              <th className="px-4 py-3 font-semibold">Nationality</th>
              <th className="px-4 py-3 font-semibold">Hired</th>
              <th className="px-4 py-3 text-right font-semibold">Monthly pay</th>
              <th className="px-4 py-3 font-semibold">Documents</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.userId} className="border-t border-[var(--line)] hover:bg-[var(--color-teal)]/[0.06]">
                <td className="px-4 py-3">
                  <Link href={`/admin/hr/${e.userId}`} className="font-medium underline-offset-4 hover:underline">
                    {e.fullName}
                  </Link>
                  {e.employeeNo && <span className="ms-2 text-xs text-[var(--color-ink)]/50">#{e.employeeNo}</span>}
                  {!e.isActive && <span className={`${badgeBase} ${badge.neutral} ms-2`}>Inactive</span>}
                  {!e.hasFile && <span className={`${badgeBase} ${badge.warn} ms-2`}>No file</span>}
                </td>
                <td className="px-4 py-3">{e.jobTitle ?? "—"}</td>
                <td className="px-4 py-3">{e.department ?? "—"}</td>
                <td className="px-4 py-3">
                  {e.nationality ?? "—"}
                  {e.isSaudi && <span className={`${badgeBase} ${badge.good} ms-2`}>Saudi</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{dateLabel(e.hireDateISO)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{e.hasFile ? sar(e.salaryTotalMinor) : "—"}</td>
                <td className="px-4 py-3">
                  <Flags flags={e.flags} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
