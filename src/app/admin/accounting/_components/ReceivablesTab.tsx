import { StatCard } from "@/components/admin/charts/StatCard";
import { receivablesAging, AGING_BUCKETS } from "@/modules/accounting/reports";
import { dateISOOf, formatMinor } from "@/modules/accounting/periods";
import { ResponsiveTable, Section } from "./ui";

export async function ReceivablesTab() {
  const aging = await receivablesAging(new Date());

  return (
    <div className="flex flex-col gap-8">
      <Section title="Aging" description={`Open invoices as of ${dateISOOf(aging.asOf)}, aged from their issue date.`}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {AGING_BUCKETS.map((b) => (
            <StatCard key={b} label={`${b} days`} value={formatMinor(aging.buckets[b])} />
          ))}
          <StatCard label="Total" value={formatMinor(aging.totalMinor)} subNote={`${aging.rows.length} invoices`} />
        </div>
      </Section>

      <Section title="Open invoices">
        <ResponsiveTable
          rows={aging.rows}
          rowKey={(r) => r.invoiceId}
          emptyMessage="No open invoices."
          testId="receivables-table"
          columns={[
            { key: "number", header: "Invoice", render: (r) => r.number },
            { key: "customer", header: "Customer", render: (r) => r.customerName },
            { key: "issued", header: "Issued", render: (r) => dateISOOf(r.issuedAt) },
            { key: "age", header: "Age", align: "end", render: (r) => `${r.ageDays} d` },
            { key: "total", header: "Total", align: "end", render: (r) => formatMinor(r.totalMinor) },
            { key: "paid", header: "Paid / credited", align: "end", render: (r) => formatMinor(r.paidMinor + r.creditedMinor) },
            { key: "due", header: "Outstanding", align: "end", render: (r) => formatMinor(r.outstandingMinor) },
          ]}
        />
      </Section>
    </div>
  );
}
