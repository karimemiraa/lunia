import Link from "next/link";

const TABS = [
  { key: "employees", href: "/admin/hr", label: "Employees" },
  { key: "attendance", href: "/admin/hr/attendance", label: "Attendance" },
  { key: "leave", href: "/admin/hr/leave", label: "Leave" },
  { key: "payroll", href: "/admin/hr/payroll", label: "Payroll" },
] as const;

export function HrTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="HR sections" className="mb-6 flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors ${
            tab.key === active
              ? "bg-[var(--color-forest)] text-[var(--color-cream)]"
              : "border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--color-ink)]/75 hover:bg-[var(--surface-2)]"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
