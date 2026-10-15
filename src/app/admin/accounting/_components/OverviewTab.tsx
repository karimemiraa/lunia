import Link from "next/link";
import { StatCard } from "@/components/admin/charts/StatCard";
import { BarChart } from "@/components/admin/charts/BarChart";
import { accountingDashboard, AGING_BUCKETS } from "@/modules/accounting/reports";
import { addMonthsToMonthKey, formatMinor, rangeFromISO, type AccountingRange } from "@/modules/accounting/periods";
import { ResponsiveTable, Section, Signed } from "./ui";
import { getStaffLocale, getStaffT } from "../../_i18n/display";
import { intlLocale, type StaffLocale } from "../../_i18n/t";

const TREND_MONTHS = 6;

function monthLabel(monthKey: string, locale: StaffLocale): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString(intlLocale(locale, "en-US"), { month: "short", year: "numeric", timeZone: "UTC" });
}

export async function OverviewTab({ range }: { range: AccountingRange }) {
  // Trend: the six calendar months ending with the selected range's last month.
  const endMonth = range.toISO.slice(0, 7);
  const trendRange = rangeFromISO(`${addMonthsToMonthKey(endMonth, -(TREND_MONTHS - 1))}-01`, range.toISO);
  const d = await accountingDashboard(range, trendRange);
  const [t, locale] = await Promise.all([getStaffT(), getStaffLocale()]);

  return (
    <div className="flex flex-col gap-8">
      <Section title={t("Profitability")} description={t("Revenue is issued invoices net of VAT, less credit notes.")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("Revenue")}
            value={formatMinor(d.revenueMinor)}
            subNote={d.creditNotesNetMinor ? t("{count} invoices, {amount} credited", { count: d.invoiceCount, amount: formatMinor(d.creditNotesNetMinor) }) : t("{count} invoices", { count: d.invoiceCount })}
          />
          <StatCard label={t("Gross profit")} value={formatMinor(d.grossProfitMinor)} subNote={t("After {amount} cost of goods", { amount: formatMinor(d.cogsMinor) })} />
          <StatCard label={t("Expenses")} value={formatMinor(d.expensesMinor)} subNote={t("Excl. {amount} input VAT", { amount: formatMinor(d.inputVatMinor) })} />
          <StatCard label={t("Collected")} value={formatMinor(d.collectedMinor)} subNote={t("All payment methods, net of refunds")} />
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title={t("Collected by method")}>
          <ResponsiveTable
            rows={d.collectedByMethod}
            rowKey={(r) => r.method}
            emptyMessage={t("No payments received in this period.")}
            columns={[
              { key: "method", header: t("Method"), render: (r) => t(r.label) },
              { key: "count", header: t("Payments"), align: "end", render: (r) => r.count },
              { key: "amount", header: t("Amount"), align: "end", render: (r) => <Signed minor={r.amountMinor}>{formatMinor(r.amountMinor)}</Signed> },
            ]}
          />
        </Section>

        <Section
          title={t("Outstanding receivables")}
          description={t("Open invoices today, by age since issue.")}
          actions={
            <Link href="/admin/accounting?tab=receivables" className="text-sm text-[var(--color-teal-ink)] underline-offset-2 hover:underline print:hidden">
              {t("View invoices")}
            </Link>
          }
        >
          <ResponsiveTable
            rows={[...AGING_BUCKETS.map((b) => ({ key: b, label: t("{range} days", { range: b }), minor: d.receivables.buckets[b] })), { key: "total", label: t("Total"), minor: d.receivables.totalMinor }]}
            rowKey={(r) => r.key}
            emphasize={(r) => r.key === "total"}
            testId="aging-buckets"
            columns={[
              { key: "bucket", header: t("Age"), render: (r) => r.label },
              { key: "amount", header: t("Outstanding"), align: "end", render: (r) => formatMinor(r.minor) },
            ]}
          />
        </Section>
      </div>

      <Section title={t("VAT position")} description={t("For the selected period. See the VAT return tab for the full breakdown.")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label={t("Output VAT")} value={formatMinor(d.outputVatMinor)} />
          <StatCard label={t("Input VAT")} value={formatMinor(d.inputVatMinor)} />
          <StatCard label={t("Net VAT payable")} value={formatMinor(d.outputVatMinor - d.inputVatMinor)} />
        </div>
      </Section>

      <Section title={t("Last {count} months", { count: TREND_MONTHS })} description={t("Costs include cost of goods, expenses and payroll.")}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <BarChart
            title={t("Revenue")}
            data={d.trend.map((m) => ({ label: monthLabel(m.month, locale), value: m.revenueMinor }))}
            valueFormatter={formatMinor}
          />
          <BarChart
            title={t("Costs")}
            data={d.trend.map((m) => ({ label: monthLabel(m.month, locale), value: m.expensesMinor }))}
            valueFormatter={formatMinor}
          />
        </div>
        <ResponsiveTable
          rows={d.trend}
          rowKey={(m) => m.month}
          columns={[
            { key: "month", header: t("Month"), render: (m) => monthLabel(m.month, locale) },
            { key: "revenue", header: t("Revenue"), align: "end", render: (m) => formatMinor(m.revenueMinor) },
            { key: "costs", header: t("Costs"), align: "end", render: (m) => formatMinor(m.expensesMinor) },
            { key: "net", header: t("Net"), align: "end", render: (m) => <Signed minor={m.netMinor}>{formatMinor(m.netMinor)}</Signed> },
          ]}
        />
      </Section>
    </div>
  );
}
