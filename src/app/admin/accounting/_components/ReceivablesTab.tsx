import { StatCard } from "@/components/admin/charts/StatCard";
import { receivablesAging, AGING_BUCKETS } from "@/modules/accounting/reports";
import { dateISOOf, formatMinor } from "@/modules/accounting/periods";
import { ResponsiveTable, Section } from "./ui";
import { getStaffT } from "../../_i18n/display";

export async function ReceivablesTab() {
  const aging = await receivablesAging(new Date());
  const t = await getStaffT();

  return (
    <div className="flex flex-col gap-8">
      <Section title={t("Aging")} description={t("Open invoices as of {date}, aged from their issue date.", { date: dateISOOf(aging.asOf) })}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {AGING_BUCKETS.map((b) => (
            <StatCard key={b} label={t("{range} days", { range: b })} value={formatMinor(aging.buckets[b])} />
          ))}
          <StatCard label={t("Total")} value={formatMinor(aging.totalMinor)} subNote={t("{count} invoices", { count: aging.rows.length })} />
        </div>
      </Section>

      <Section title={t("Open invoices")}>
        <ResponsiveTable
          rows={aging.rows}
          rowKey={(r) => r.invoiceId}
          emptyMessage={t("No open invoices.")}
          testId="receivables-table"
          columns={[
            { key: "number", header: t("Invoice"), render: (r) => r.number },
            { key: "customer", header: t("Customer"), render: (r) => r.customerName },
            { key: "issued", header: t("Issue date"), render: (r) => dateISOOf(r.issuedAt) },
            { key: "age", header: t("Age"), align: "end", render: (r) => t("{days} d", { days: r.ageDays }) },
            { key: "total", header: t("Total"), align: "end", render: (r) => formatMinor(r.totalMinor) },
            { key: "paid", header: t("Paid / credited"), align: "end", render: (r) => formatMinor(r.paidMinor + r.creditedMinor) },
            { key: "due", header: t("Outstanding"), align: "end", render: (r) => formatMinor(r.outstandingMinor) },
          ]}
        />
      </Section>
    </div>
  );
}
