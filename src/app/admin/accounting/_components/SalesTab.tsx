import { StatCard } from "@/components/admin/charts/StatCard";
import { BarChart } from "@/components/admin/charts/BarChart";
import { salesAnalysis, type SalesGroupRow } from "@/modules/accounting/reports";
import { formatMinor, type AccountingRange } from "@/modules/accounting/periods";
import { ResponsiveTable, Section, Signed, type MoneyColumn } from "./ui";
import { getStaffT } from "../../_i18n/display";
import type { T } from "../../_i18n/t";

const groupColumns = (t: T, first: string): MoneyColumn<SalesGroupRow>[] => [
  { key: "label", header: t(first), render: (r) => t(r.label) },
  { key: "qty", header: t("Qty"), align: "end", render: (r) => r.qty },
  { key: "net", header: t("Net sales"), align: "end", render: (r) => <Signed minor={r.netMinor}>{formatMinor(r.netMinor)}</Signed> },
];

export async function SalesTab({ range }: { range: AccountingRange }) {
  const s = await salesAnalysis(range);
  const t = await getStaffT();

  return (
    <div className="flex flex-col gap-8">
      <Section title={t("Invoices")} description={t("Net sales exclude VAT and are reduced by credit notes.")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label={t("Invoices issued")} value={s.invoiceCount.toLocaleString("en-US")} />
          <StatCard label={t("Average invoice")} value={formatMinor(s.averageInvoiceMinor)} subNote={t("Including VAT")} />
          <StatCard label={t("Average invoice (net)")} value={formatMinor(s.averageInvoiceNetMinor)} subNote={t("Excluding VAT")} />
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BarChart
          title={t("Top services")}
          data={s.byService.slice(0, 8).map((r) => ({ label: r.label, value: Math.max(0, r.netMinor) }))}
          valueFormatter={formatMinor}
          emptyMessage={t("No service sales in this period.")}
        />
        <BarChart
          title={t("By department")}
          data={s.byDepartment.map((r) => ({ label: r.label, value: Math.max(0, r.netMinor) }))}
          valueFormatter={formatMinor}
          emptyMessage={t("No service sales in this period.")}
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Section title={t("By service")}>
          <ResponsiveTable rows={s.byService} rowKey={(r) => r.key} columns={groupColumns(t, "Service")} emptyMessage={t("No service sales in this period.")} />
        </Section>
        <Section title={t("By department")}>
          <ResponsiveTable rows={s.byDepartment} rowKey={(r) => r.key} columns={groupColumns(t, "Department")} emptyMessage={t("No service sales in this period.")} />
        </Section>
        <Section title={t("By staff")} description={t("From the appointment on the invoice's booking; walk-in sales are unassigned.")}>
          <ResponsiveTable rows={s.byStaff} rowKey={(r) => r.key} columns={groupColumns(t, "Staff")} emptyMessage={t("No sales in this period.")} />
        </Section>
        <Section title={t("By product")}>
          <ResponsiveTable rows={s.byProduct} rowKey={(r) => r.key} columns={groupColumns(t, "Product")} emptyMessage={t("No product sales in this period.")} />
        </Section>
        <Section title={t("By payment method")} description={t("Money received in the period, net of refunds.")}>
          <ResponsiveTable
            rows={s.byMethod}
            rowKey={(r) => r.method}
            emptyMessage={t("No payments received in this period.")}
            columns={[
              { key: "method", header: t("Method"), render: (r) => t(r.label) },
              { key: "count", header: t("Payments"), align: "end", render: (r) => r.count },
              { key: "amount", header: t("Amount"), align: "end", render: (r) => <Signed minor={r.amountMinor}>{formatMinor(r.amountMinor)}</Signed> },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
