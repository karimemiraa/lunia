import { StatCard } from "@/components/admin/charts/StatCard";
import { BarChart } from "@/components/admin/charts/BarChart";
import { salesAnalysis, type SalesGroupRow } from "@/modules/accounting/reports";
import { formatMinor, type AccountingRange } from "@/modules/accounting/periods";
import { ResponsiveTable, Section, Signed, type MoneyColumn } from "./ui";

const groupColumns = (first: string): MoneyColumn<SalesGroupRow>[] => [
  { key: "label", header: first, render: (r) => r.label },
  { key: "qty", header: "Qty", align: "end", render: (r) => r.qty },
  { key: "net", header: "Net sales", align: "end", render: (r) => <Signed minor={r.netMinor}>{formatMinor(r.netMinor)}</Signed> },
];

export async function SalesTab({ range }: { range: AccountingRange }) {
  const s = await salesAnalysis(range);

  return (
    <div className="flex flex-col gap-8">
      <Section title="Invoices" description="Net sales exclude VAT and are reduced by credit notes.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Invoices issued" value={s.invoiceCount.toLocaleString("en-US")} />
          <StatCard label="Average invoice" value={formatMinor(s.averageInvoiceMinor)} subNote="Including VAT" />
          <StatCard label="Average invoice (net)" value={formatMinor(s.averageInvoiceNetMinor)} subNote="Excluding VAT" />
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BarChart
          title="Top services"
          data={s.byService.slice(0, 8).map((r) => ({ label: r.label, value: Math.max(0, r.netMinor) }))}
          valueFormatter={formatMinor}
          emptyMessage="No service sales in this period."
        />
        <BarChart
          title="By department"
          data={s.byDepartment.map((r) => ({ label: r.label, value: Math.max(0, r.netMinor) }))}
          valueFormatter={formatMinor}
          emptyMessage="No service sales in this period."
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Section title="By service">
          <ResponsiveTable rows={s.byService} rowKey={(r) => r.key} columns={groupColumns("Service")} emptyMessage="No service sales in this period." />
        </Section>
        <Section title="By department">
          <ResponsiveTable rows={s.byDepartment} rowKey={(r) => r.key} columns={groupColumns("Department")} emptyMessage="No service sales in this period." />
        </Section>
        <Section title="By staff" description="From the appointment on the invoice's booking; walk-in sales are unassigned.">
          <ResponsiveTable rows={s.byStaff} rowKey={(r) => r.key} columns={groupColumns("Staff")} emptyMessage="No sales in this period." />
        </Section>
        <Section title="By product">
          <ResponsiveTable rows={s.byProduct} rowKey={(r) => r.key} columns={groupColumns("Product")} emptyMessage="No product sales in this period." />
        </Section>
        <Section title="By payment method" description="Money received in the period, net of refunds.">
          <ResponsiveTable
            rows={s.byMethod}
            rowKey={(r) => r.method}
            emptyMessage="No payments received in this period."
            columns={[
              { key: "method", header: "Method", render: (r) => r.label },
              { key: "count", header: "Payments", align: "end", render: (r) => r.count },
              { key: "amount", header: "Amount", align: "end", render: (r) => <Signed minor={r.amountMinor}>{formatMinor(r.amountMinor)}</Signed> },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
