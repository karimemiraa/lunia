import { StatCard } from "@/components/admin/charts/StatCard";
import { vatSummary, type VatPeriodRow } from "@/modules/accounting/reports";
import { formatMinor, type AccountingRange, type VatPeriod } from "@/modules/accounting/periods";
import { ResponsiveTable, Section, Signed } from "./ui";
import { getStaffT } from "../../_i18n/display";

export async function VatTab({ range, period }: { range: AccountingRange; period: VatPeriod }) {
  const summary = await vatSummary(range, period);
  const total = summary.total;
  const rows = summary.rows.length > 1 ? [...summary.rows, total] : summary.rows;
  const t = await getStaffT();

  return (
    <div className="flex flex-col gap-8">
      <Section title={t("VAT return summary")} description={t("Figures to prepare the ZATCA VAT return. Sales by invoice issue date, purchases by expense date.")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label={t("Output VAT")} value={formatMinor(total.outputVatMinor)} subNote={t("VAT on sales less credit notes")} />
          <StatCard label={t("Input VAT")} value={formatMinor(total.inputVatMinor)} subNote={t("VAT on expenses")} />
          <StatCard label={total.netVatMinor >= 0 ? t("Net VAT payable") : t("Net VAT refundable")} value={formatMinor(Math.abs(total.netVatMinor))} />
        </div>
      </Section>

      <Section title={t("Sales (output VAT)")}>
        <ResponsiveTable<VatPeriodRow>
          rows={rows}
          rowKey={(r) => r.period}
          emphasize={(r) => r.period === "Total"}
          testId="vat-sales-table"
          columns={[
            { key: "period", header: t("Period"), render: (r) => t(r.period) },
            { key: "std", header: t("Standard-rated sales"), align: "end", render: (r) => formatMinor(r.standardSalesMinor) },
            { key: "stdVat", header: t("VAT on sales"), align: "end", render: (r) => formatMinor(r.standardVatMinor) },
            { key: "cnNet", header: t("Credit notes"), align: "end", render: (r) => formatMinor(-r.creditNotesNetMinor) },
            { key: "cnVat", header: t("Credit note VAT"), align: "end", render: (r) => formatMinor(-r.creditNotesVatMinor) },
            { key: "zero", header: t("Zero-rated / exempt"), align: "end", render: (r) => formatMinor(r.zeroRatedSalesMinor) },
            { key: "out", header: t("Output VAT"), align: "end", render: (r) => formatMinor(r.outputVatMinor) },
          ]}
        />
      </Section>

      <Section title={t("Purchases (input VAT)")}>
        <ResponsiveTable<VatPeriodRow>
          rows={rows}
          rowKey={(r) => r.period}
          emphasize={(r) => r.period === "Total"}
          testId="vat-purchases-table"
          columns={[
            { key: "period", header: t("Period"), render: (r) => t(r.period) },
            { key: "purch", header: t("Purchases with VAT"), align: "end", render: (r) => formatMinor(r.purchasesMinor) },
            { key: "in", header: t("Input VAT"), align: "end", render: (r) => formatMinor(r.inputVatMinor) },
            { key: "nonVat", header: t("Purchases without VAT"), align: "end", render: (r) => formatMinor(r.nonVatPurchasesMinor) },
            { key: "net", header: t("Net VAT"), align: "end", render: (r) => <Signed minor={r.netVatMinor}>{formatMinor(r.netVatMinor)}</Signed> },
          ]}
        />
      </Section>

      <div className="lunia-card px-5 py-4 text-sm leading-relaxed text-[var(--color-ink)]/70">
        <p className="font-medium text-[var(--color-ink)]">{t("Notes")}</p>
        <ul className="mt-1 list-disc ps-5">
          <li>{t("Input VAT comes from expenses only. Purchase orders do not record VAT, so VAT paid on stock bought through Inventory is not included here; add it from the supplier tax invoices when filing.")}</li>
          <li>{t("Salaries, GOSI and most government fees carry no VAT and appear under purchases without VAT.")}</li>
          <li>{t("Check the figures against the ZATCA portal before filing; this summary does not replace your accountant’s review.")}</li>
        </ul>
      </div>
    </div>
  );
}
