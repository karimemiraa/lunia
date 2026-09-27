import { StatCard } from "@/components/admin/charts/StatCard";
import { vatSummary, type VatPeriodRow } from "@/modules/accounting/reports";
import { formatMinor, type AccountingRange, type VatPeriod } from "@/modules/accounting/periods";
import { ResponsiveTable, Section, Signed } from "./ui";

export async function VatTab({ range, period }: { range: AccountingRange; period: VatPeriod }) {
  const summary = await vatSummary(range, period);
  const t = summary.total;
  const rows = summary.rows.length > 1 ? [...summary.rows, t] : summary.rows;

  return (
    <div className="flex flex-col gap-8">
      <Section title="VAT return summary" description="Figures to prepare the ZATCA VAT return. Sales by invoice issue date, purchases by expense date.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Output VAT" value={formatMinor(t.outputVatMinor)} subNote="VAT on sales less credit notes" />
          <StatCard label="Input VAT" value={formatMinor(t.inputVatMinor)} subNote="VAT on expenses" />
          <StatCard label={t.netVatMinor >= 0 ? "Net VAT payable" : "Net VAT refundable"} value={formatMinor(Math.abs(t.netVatMinor))} />
        </div>
      </Section>

      <Section title="Sales (output VAT)">
        <ResponsiveTable<VatPeriodRow>
          rows={rows}
          rowKey={(r) => r.period}
          emphasize={(r) => r.period === "Total"}
          testId="vat-sales-table"
          columns={[
            { key: "period", header: "Period", render: (r) => r.period },
            { key: "std", header: "Standard-rated sales", align: "end", render: (r) => formatMinor(r.standardSalesMinor) },
            { key: "stdVat", header: "VAT on sales", align: "end", render: (r) => formatMinor(r.standardVatMinor) },
            { key: "cnNet", header: "Credit notes", align: "end", render: (r) => formatMinor(-r.creditNotesNetMinor) },
            { key: "cnVat", header: "Credit note VAT", align: "end", render: (r) => formatMinor(-r.creditNotesVatMinor) },
            { key: "zero", header: "Zero-rated / exempt", align: "end", render: (r) => formatMinor(r.zeroRatedSalesMinor) },
            { key: "out", header: "Output VAT", align: "end", render: (r) => formatMinor(r.outputVatMinor) },
          ]}
        />
      </Section>

      <Section title="Purchases (input VAT)">
        <ResponsiveTable<VatPeriodRow>
          rows={rows}
          rowKey={(r) => r.period}
          emphasize={(r) => r.period === "Total"}
          testId="vat-purchases-table"
          columns={[
            { key: "period", header: "Period", render: (r) => r.period },
            { key: "purch", header: "Purchases with VAT", align: "end", render: (r) => formatMinor(r.purchasesMinor) },
            { key: "in", header: "Input VAT", align: "end", render: (r) => formatMinor(r.inputVatMinor) },
            { key: "nonVat", header: "Purchases without VAT", align: "end", render: (r) => formatMinor(r.nonVatPurchasesMinor) },
            { key: "net", header: "Net VAT", align: "end", render: (r) => <Signed minor={r.netVatMinor}>{formatMinor(r.netVatMinor)}</Signed> },
          ]}
        />
      </Section>

      <div className="lunia-card px-5 py-4 text-sm leading-relaxed text-[var(--color-ink)]/70">
        <p className="font-medium text-[var(--color-ink)]">Notes</p>
        <ul className="mt-1 list-disc ps-5">
          <li>Input VAT comes from expenses only. Purchase orders do not record VAT, so VAT paid on stock bought through Inventory is not included here; add it from the supplier tax invoices when filing.</li>
          <li>Salaries, GOSI and most government fees carry no VAT and appear under purchases without VAT.</li>
          <li>Check the figures against the ZATCA portal before filing; this summary does not replace your accountant&rsquo;s review.</li>
        </ul>
      </div>
    </div>
  );
}
