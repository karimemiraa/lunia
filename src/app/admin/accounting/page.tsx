import Link from "next/link";
import { AdminShell } from "../_components/AdminShell";
import { requireAccounting } from "./_components/access";
import { PrintStyles, RangeForm, RangeShortcuts, ReportActions, labelClass } from "./_components/ui";
import { OverviewTab } from "./_components/OverviewTab";
import { PnlTab } from "./_components/PnlTab";
import { VatTab } from "./_components/VatTab";
import { SalesTab } from "./_components/SalesTab";
import { ReceivablesTab } from "./_components/ReceivablesTab";
import { resolveAccountingRange, dateISOOf, type VatPeriod } from "@/modules/accounting/periods";
import { getOpenCashSession } from "@/modules/accounting/cash";

const ACCOUNTING_TABS = [
  { id: "overview", label: "Overview" },
  { id: "pnl", label: "Profit & loss" },
  { id: "vat", label: "VAT return" },
  { id: "sales", label: "Sales analysis" },
  { id: "receivables", label: "Receivables" },
] as const;

type TabId = (typeof ACCOUNTING_TABS)[number]["id"];

function isTab(value: string | undefined): value is TabId {
  return ACCOUNTING_TABS.some((t) => t.id === value);
}

interface AccountingPageProps {
  searchParams: Promise<{ tab?: string; from?: string; to?: string; period?: string }>;
}

export default async function AccountingPage({ searchParams }: AccountingPageProps) {
  const user = await requireAccounting();
  const params = await searchParams;
  const tab: TabId = isTab(params.tab) ? params.tab : "overview";
  const range = resolveAccountingRange(params.from, params.to);
  const period: VatPeriod = params.period === "month" ? "month" : "quarter";
  const todayISO = dateISOOf(new Date());
  const openSession = await getOpenCashSession();

  const keep = { tab, from: range.fromISO, to: range.toISO, period: tab === "vat" ? period : undefined };
  const exportQs = new URLSearchParams({ report: tab === "overview" ? "overview" : tab, from: range.fromISO, to: range.toISO });
  if (tab === "vat") exportQs.set("period", period);

  return (
    <AdminShell
      user={user}
      title="Accounting"
      description="Revenue, collections, receivables, expenses, VAT and profit for the center, in Riyadh time."
      actions={
        <div className="flex flex-wrap gap-2 print:hidden">
          <Link href="/admin/accounting/cash" className="lunia-btn lunia-btn-ghost min-h-11" data-testid="cash-drawer-link">
            Cash drawer{openSession ? " (open)" : ""}
          </Link>
          <Link href="/admin/accounting/expenses" className="lunia-btn lunia-btn-ghost min-h-11">
            Expenses
          </Link>
        </div>
      }
    >
      <PrintStyles />
      <div className="flex flex-col gap-6">
        <nav aria-label="Accounting reports" className="flex gap-1 overflow-x-auto border-b border-[var(--line)] print:hidden">
          {ACCOUNTING_TABS.map((t) => {
            const qs = new URLSearchParams({ tab: t.id, from: range.fromISO, to: range.toISO });
            const selected = t.id === tab;
            return (
              <Link
                key={t.id}
                href={`/admin/accounting?${qs.toString()}`}
                aria-current={selected ? "page" : undefined}
                className={`-mb-px flex min-h-11 shrink-0 items-center border-b-2 px-4 text-sm font-medium transition-colors ${
                  selected
                    ? "border-[var(--color-teal)] text-[var(--color-ink)]"
                    : "border-transparent text-[var(--color-ink)]/55 hover:text-[var(--color-ink)]"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        {tab !== "receivables" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <RangeForm action="/admin/accounting" fromISO={range.fromISO} toISO={range.toISO} hidden={{ tab }}>
                {tab === "vat" && (
                  <label className="flex flex-col gap-1 text-sm">
                    <span className={labelClass}>Group by</span>
                    <select name="period" defaultValue={period} className="lunia-input min-h-11">
                      <option value="quarter">Quarter</option>
                      <option value="month">Month</option>
                    </select>
                  </label>
                )}
              </RangeForm>
              <ReportActions exportHref={`/admin/accounting/export?${exportQs.toString()}`} />
            </div>
            <RangeShortcuts base="/admin/accounting" todayISO={todayISO} params={keep} />
            <p className="hidden text-sm print:block">
              Period: {range.fromISO} to {range.toISO}
            </p>
          </div>
        )}
        {tab === "receivables" && (
          <div className="flex justify-end">
            <ReportActions exportHref="/admin/accounting/export?report=receivables" />
          </div>
        )}

        {tab === "overview" && <OverviewTab range={range} />}
        {tab === "pnl" && <PnlTab range={range} />}
        {tab === "vat" && <VatTab range={range} period={period} />}
        {tab === "sales" && <SalesTab range={range} />}
        {tab === "receivables" && <ReceivablesTab />}
      </div>
    </AdminShell>
  );
}
