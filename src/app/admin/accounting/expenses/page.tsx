import Link from "next/link";
import { AdminShell } from "../../_components/AdminShell";
import { StatCard } from "@/components/admin/charts/StatCard";
import { requireAccounting } from "../_components/access";
import { PrintStyles, RangeForm, RangeShortcuts, ReportActions, ResponsiveTable, Section, labelClass } from "../_components/ui";
import { EXPENSE_METHODS, METHOD_LABELS, listExpenseCategories, listExpenses } from "@/modules/accounting/expenses";
import { dateISOOf, formatMinor } from "@/modules/accounting/periods";
import { expenseFilterQuery, parseExpenseFilterParams } from "./filters";

interface ExpensesPageProps {
  searchParams: Promise<{ from?: string; to?: string; category?: string; method?: string; q?: string }>;
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const user = await requireAccounting();
  const params = await searchParams;
  const filter = parseExpenseFilterParams(params);
  const [categories, { rows, totals }] = await Promise.all([listExpenseCategories(), listExpenses(filter)]);
  const exportQs = expenseFilterQuery(filter);
  exportQs.set("report", "expenses");
  const keep = { category: filter.categoryId, method: filter.method, q: filter.search };

  return (
    <AdminShell
      user={user}
      title="Expenses"
      description="Bills and purchases paid by the center, with the input VAT you can reclaim."
      actions={
        <Link href="/admin/accounting/expenses/new" className="lunia-btn lunia-btn-forest min-h-11 print:hidden" data-testid="new-expense-link">
          Record expense
        </Link>
      }
    >
      <PrintStyles />
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <RangeForm action="/admin/accounting/expenses" fromISO={filter.range.fromISO} toISO={filter.range.toISO}>
            <label className="flex flex-col gap-1 text-sm">
              <span className={labelClass}>Category</span>
              <select name="category" defaultValue={filter.categoryId ?? ""} className="lunia-input min-h-11">
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="none">Uncategorized</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className={labelClass}>Paid by</span>
              <select name="method" defaultValue={filter.method ?? ""} className="lunia-input min-h-11">
                <option value="">Any method</option>
                {EXPENSE_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className={labelClass}>Search</span>
              <input type="search" name="q" defaultValue={filter.search ?? ""} placeholder="Vendor, description, ref" className="lunia-input min-h-11 w-56" />
            </label>
          </RangeForm>
          <ReportActions exportHref={`/admin/accounting/export?${exportQs.toString()}`} />
        </div>
        <RangeShortcuts base="/admin/accounting/expenses" todayISO={dateISOOf(new Date())} params={keep} />
        <p className="hidden text-sm print:block">
          Period: {filter.range.fromISO} to {filter.range.toISO}
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="expense-totals">
          <StatCard label="Excl. VAT" value={formatMinor(totals.amountMinor)} subNote={`${totals.count} expense${totals.count === 1 ? "" : "s"}`} />
          <StatCard label="Input VAT" value={formatMinor(totals.vatMinor)} />
          <StatCard label="Total paid" value={formatMinor(totals.totalMinor)} />
        </div>

        {totals.byCategory.length > 1 && (
          <Section title="By category">
            <ResponsiveTable
              rows={totals.byCategory}
              rowKey={(r) => r.category}
              columns={[
                { key: "category", header: "Category", render: (r) => r.category },
                { key: "amount", header: "Excl. VAT", align: "end", render: (r) => formatMinor(r.amountMinor) },
                { key: "vat", header: "VAT", align: "end", render: (r) => formatMinor(r.vatMinor) },
              ]}
            />
          </Section>
        )}

        <Section title="Expenses">
          <ResponsiveTable
            rows={rows}
            rowKey={(r) => r.id}
            testId="expenses-table"
            emptyMessage="No expenses match these filters."
            columns={[
              {
                key: "description",
                header: "Expense",
                render: (r) => (
                  <Link href={`/admin/accounting/expenses/${r.id}`} className="flex min-h-11 flex-col justify-center hover:text-[var(--color-teal-ink)]">
                    <span className="font-medium">{r.description}</span>
                    <span className="text-xs text-[var(--color-ink)]/55">{[r.vendor, r.reference].filter(Boolean).join(" · ") || "No vendor"}</span>
                  </Link>
                ),
              },
              { key: "date", header: "Date", render: (r) => r.dateISO },
              { key: "category", header: "Category", render: (r) => r.category },
              { key: "method", header: "Paid by", render: (r) => METHOD_LABELS[r.method] },
              { key: "amount", header: "Excl. VAT", align: "end", render: (r) => formatMinor(r.amountMinor) },
              { key: "vat", header: "VAT", align: "end", render: (r) => formatMinor(r.vatMinor) },
              {
                key: "receipt",
                header: "Receipt",
                render: (r) =>
                  r.hasReceipt ? (
                    <a
                      href={`/admin/accounting/expenses/${r.id}/receipt`}
                      target="_blank"
                      rel="noopener"
                      className="text-[var(--color-teal-ink)] underline-offset-2 hover:underline"
                    >
                      View
                    </a>
                  ) : (
                    <span className="text-[var(--color-ink)]/40">None</span>
                  ),
              },
            ]}
          />
        </Section>
      </div>
    </AdminShell>
  );
}
