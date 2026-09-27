import { profitAndLoss, type PnlMonth } from "@/modules/accounting/reports";
import { formatMinor, type AccountingRange } from "@/modules/accounting/periods";
import { Section } from "./ui";

interface Line {
  key: string;
  label: string;
  value: (m: PnlMonth) => number;
  kind?: "subtotal" | "total" | "indent" | "heading";
}

function monthLabel(monthKey: string): string {
  if (monthKey === "Total") return "Total";
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export async function PnlTab({ range }: { range: AccountingRange }) {
  const pnl = await profitAndLoss(range);
  const columns = pnl.months.length > 1 ? [...pnl.months, pnl.total] : pnl.months;

  const lines: Line[] = [
    { key: "h-rev", label: "Revenue", value: () => 0, kind: "heading" },
    { key: "services", label: "Services", value: (m) => m.servicesMinor, kind: "indent" },
    { key: "products", label: "Products", value: (m) => m.productsMinor, kind: "indent" },
    { key: "other", label: "Other / adjustments", value: (m) => m.otherRevenueMinor, kind: "indent" },
    { key: "revenue", label: "Total revenue", value: (m) => m.revenueMinor, kind: "subtotal" },
    { key: "h-cogs", label: "Cost of goods", value: () => 0, kind: "heading" },
    { key: "cogsProducts", label: "Products sold (at cost)", value: (m) => -m.cogsProductsMinor, kind: "indent" },
    { key: "cogsConsumables", label: "Consumables used", value: (m) => -m.cogsConsumablesMinor, kind: "indent" },
    { key: "gross", label: "Gross profit", value: (m) => m.grossProfitMinor, kind: "subtotal" },
    { key: "h-exp", label: "Operating expenses", value: () => 0, kind: "heading" },
    ...pnl.categories.map((c): Line => ({ key: `cat-${c}`, label: c, value: (m) => -(m.expensesByCategory[c] ?? 0), kind: "indent" })),
    { key: "payroll", label: "Payroll incl. employer GOSI", value: (m) => -m.payrollMinor, kind: "indent" },
    { key: "opex", label: "Total operating costs", value: (m) => -(m.expensesMinor + m.payrollMinor), kind: "subtotal" },
    { key: "net", label: "Net profit", value: (m) => m.netMinor, kind: "total" },
  ];

  return (
    <Section
      title="Profit & loss by month"
      description="Costs are shown in brackets. Revenue excludes VAT and is net of credit notes. Payroll counts approved and paid runs for each month in full, even when the range covers part of it. Stock tracked in Inventory is costed when sold or used, so record it as an expense only if it is not tracked there."
    >
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-md)] print:shadow-none" data-testid="pnl-table">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]">
              <th className="sticky start-0 bg-[var(--surface-2)] px-4 py-3 text-start text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
                Line
              </th>
              {columns.map((m) => (
                <th key={m.month} className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
                  {monthLabel(m.month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const rowClass =
                line.kind === "total"
                  ? "border-t-2 border-[var(--color-ink)]/30 font-semibold"
                  : line.kind === "subtotal"
                    ? "border-t border-[var(--line)] font-medium"
                    : line.kind === "heading"
                      ? "border-t border-[var(--line)]"
                      : "";
              return (
                <tr key={line.key} className={rowClass}>
                  <td
                    className={`sticky start-0 bg-[var(--surface)] px-4 py-2 ${line.kind === "indent" ? "ps-8 text-[var(--color-ink)]/80" : ""} ${
                      line.kind === "heading" ? "pt-4 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-ink)]/55" : ""
                    }`}
                  >
                    {line.label}
                  </td>
                  {columns.map((m) => {
                    if (line.kind === "heading") return <td key={m.month} />;
                    const v = line.value(m);
                    return (
                      <td
                        key={m.month}
                        className={`px-4 py-2 text-end tabular-nums ${v < 0 && (line.kind === "total" || line.key === "gross") ? "text-[#b42318]" : ""}`}
                      >
                        {v === 0 ? "-" : v < 0 ? `(${formatMinor(-v)})` : formatMinor(v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
