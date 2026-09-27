import Link from "next/link";
import { StatCard } from "@/components/admin/charts/StatCard";
import { BarChart } from "@/components/admin/charts/BarChart";
import { accountingDashboard, AGING_BUCKETS } from "@/modules/accounting/reports";
import { addMonthsToMonthKey, formatMinor, rangeFromISO, type AccountingRange } from "@/modules/accounting/periods";
import { ResponsiveTable, Section, Signed } from "./ui";

const TREND_MONTHS = 6;

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export async function OverviewTab({ range }: { range: AccountingRange }) {
  // Trend: the six calendar months ending with the selected range's last month.
  const endMonth = range.toISO.slice(0, 7);
  const trendRange = rangeFromISO(`${addMonthsToMonthKey(endMonth, -(TREND_MONTHS - 1))}-01`, range.toISO);
  const d = await accountingDashboard(range, trendRange);

  return (
    <div className="flex flex-col gap-8">
      <Section title="Profitability" description="Revenue is issued invoices net of VAT, less credit notes.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Revenue"
            value={formatMinor(d.revenueMinor)}
            subNote={`${d.invoiceCount} invoices${d.creditNotesNetMinor ? `, ${formatMinor(d.creditNotesNetMinor)} credited` : ""}`}
          />
          <StatCard label="Gross profit" value={formatMinor(d.grossProfitMinor)} subNote={`After ${formatMinor(d.cogsMinor)} cost of goods`} />
          <StatCard label="Expenses" value={formatMinor(d.expensesMinor)} subNote={`Excl. ${formatMinor(d.inputVatMinor)} input VAT`} />
          <StatCard label="Collected" value={formatMinor(d.collectedMinor)} subNote="All payment methods, net of refunds" />
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Collected by method">
          <ResponsiveTable
            rows={d.collectedByMethod}
            rowKey={(r) => r.method}
            emptyMessage="No payments received in this period."
            columns={[
              { key: "method", header: "Method", render: (r) => r.label },
              { key: "count", header: "Payments", align: "end", render: (r) => r.count },
              { key: "amount", header: "Amount", align: "end", render: (r) => <Signed minor={r.amountMinor}>{formatMinor(r.amountMinor)}</Signed> },
            ]}
          />
        </Section>

        <Section
          title="Outstanding receivables"
          description="Open invoices today, by age since issue."
          actions={
            <Link href="/admin/accounting?tab=receivables" className="text-sm text-[var(--color-teal-ink)] underline-offset-2 hover:underline print:hidden">
              View invoices
            </Link>
          }
        >
          <ResponsiveTable
            rows={[...AGING_BUCKETS.map((b) => ({ key: b, label: `${b} days`, minor: d.receivables.buckets[b] })), { key: "total", label: "Total", minor: d.receivables.totalMinor }]}
            rowKey={(r) => r.key}
            emphasize={(r) => r.key === "total"}
            testId="aging-buckets"
            columns={[
              { key: "bucket", header: "Age", render: (r) => r.label },
              { key: "amount", header: "Outstanding", align: "end", render: (r) => formatMinor(r.minor) },
            ]}
          />
        </Section>
      </div>

      <Section title="VAT position" description="For the selected period. See the VAT return tab for the full breakdown.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Output VAT" value={formatMinor(d.outputVatMinor)} />
          <StatCard label="Input VAT" value={formatMinor(d.inputVatMinor)} />
          <StatCard label="Net VAT payable" value={formatMinor(d.outputVatMinor - d.inputVatMinor)} />
        </div>
      </Section>

      <Section title={`Last ${TREND_MONTHS} months`} description="Costs include cost of goods, expenses and payroll.">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <BarChart
            title="Revenue"
            data={d.trend.map((t) => ({ label: monthLabel(t.month), value: t.revenueMinor }))}
            valueFormatter={formatMinor}
          />
          <BarChart
            title="Costs"
            data={d.trend.map((t) => ({ label: monthLabel(t.month), value: t.expensesMinor }))}
            valueFormatter={formatMinor}
          />
        </div>
        <ResponsiveTable
          rows={d.trend}
          rowKey={(t) => t.month}
          columns={[
            { key: "month", header: "Month", render: (t) => monthLabel(t.month) },
            { key: "revenue", header: "Revenue", align: "end", render: (t) => formatMinor(t.revenueMinor) },
            { key: "costs", header: "Costs", align: "end", render: (t) => formatMinor(t.expensesMinor) },
            { key: "net", header: "Net", align: "end", render: (t) => <Signed minor={t.netMinor}>{formatMinor(t.netMinor)}</Signed> },
          ]}
        />
      </Section>
    </div>
  );
}
