import Link from "next/link";
import { AdminShell } from "../../_components/AdminShell";
import { StatCard } from "@/components/admin/charts/StatCard";
import { requireAccounting } from "../_components/access";
import { PrintStyles, RangeForm, RangeShortcuts, ReportActions, ResponsiveTable, Section, labelClass } from "../_components/ui";
import { EXPENSE_METHODS, METHOD_LABELS, listExpenseCategories, listExpenses } from "@/modules/accounting/expenses";
import { dateISOOf, formatMinor } from "@/modules/accounting/periods";
import { expenseFilterQuery, parseExpenseFilterParams } from "./filters";
import { getStaffT } from "../../_i18n/display";

interface ExpensesPageProps {
  searchParams: Promise<{ from?: string; to?: string; category?: string; method?: string; q?: string }>;
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const user = await requireAccounting();
  const params = await searchParams;
  const t = await getStaffT();
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
          {t("Record expense")}
        </Link>
      }
    >
      <PrintStyles />
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <RangeForm action="/admin/accounting/expenses" fromISO={filter.range.fromISO} toISO={filter.range.toISO}>
            <label className="flex flex-col gap-1 text-sm">
              <span className={labelClass}>{t("Category")}</span>
              <select name="category" defaultValue={filter.categoryId ?? ""} className="lunia-input min-h-11">
                <option value="">{t("All categories")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {t(c.name)}
                  </option>
                ))}
                <option value="none">{t("Uncategorized")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className={labelClass}>{t("Paid by")}</span>
              <select name="method" defaultValue={filter.method ?? ""} className="lunia-input min-h-11">
                <option value="">{t("Any method")}</option>
                {EXPENSE_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(METHOD_LABELS[m])}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className={labelClass}>{t("Search")}</span>
              <input type="search" name="q" defaultValue={filter.search ?? ""} placeholder={t("Vendor, description, ref")} className="lunia-input min-h-11 w-56" />
            </label>
          </RangeForm>
          <ReportActions exportHref={`/admin/accounting/export?${exportQs.toString()}`} />
        </div>
        <RangeShortcuts base="/admin/accounting/expenses" todayISO={dateISOOf(new Date())} params={keep} />
        <p className="hidden text-sm print:block">
          {t("Period: {from} to {to}", { from: filter.range.fromISO, to: filter.range.toISO })}
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="expense-totals">
          <StatCard label={t("Excl. VAT")} value={formatMinor(totals.amountMinor)} subNote={totals.count === 1 ? t("{count} expense", { count: totals.count }) : t("{count} expenses", { count: totals.count })} />
          <StatCard label={t("Input VAT")} value={formatMinor(totals.vatMinor)} />
          <StatCard label={t("Total paid")} value={formatMinor(totals.totalMinor)} />
        </div>

        {totals.byCategory.length > 1 && (
          <Section title={t("By category")}>
            <ResponsiveTable
              rows={totals.byCategory}
              rowKey={(r) => r.category}
              columns={[
                { key: "category", header: t("Category"), render: (r) => t(r.category) },
                { key: "amount", header: t("Excl. VAT"), align: "end", render: (r) => formatMinor(r.amountMinor) },
                { key: "vat", header: t("VAT"), align: "end", render: (r) => formatMinor(r.vatMinor) },
              ]}
            />
          </Section>
        )}

        <Section title={t("Expenses")}>
          <ResponsiveTable
            rows={rows}
            rowKey={(r) => r.id}
            testId="expenses-table"
            emptyMessage={t("No expenses match these filters.")}
            columns={[
              {
                key: "description",
                header: t("Expense"),
                render: (r) => (
                  <Link href={`/admin/accounting/expenses/${r.id}`} className="flex min-h-11 flex-col justify-center hover:text-[var(--color-teal-ink)]">
                    <span className="font-medium">{r.description}</span>
                    <span className="text-xs text-[var(--color-ink)]/55">{[r.vendor, r.reference].filter(Boolean).join(" · ") || t("No vendor")}</span>
                  </Link>
                ),
              },
              { key: "date", header: t("Date"), render: (r) => r.dateISO },
              { key: "category", header: t("Category"), render: (r) => t(r.category) },
              { key: "method", header: t("Paid by"), render: (r) => t(METHOD_LABELS[r.method]) },
              { key: "amount", header: t("Excl. VAT"), align: "end", render: (r) => formatMinor(r.amountMinor) },
              { key: "vat", header: t("VAT"), align: "end", render: (r) => formatMinor(r.vatMinor) },
              {
                key: "receipt",
                header: t("Receipt"),
                render: (r) =>
                  r.hasReceipt ? (
                    <a
                      href={`/admin/accounting/expenses/${r.id}/receipt`}
                      target="_blank"
                      rel="noopener"
                      className="text-[var(--color-teal-ink)] underline-offset-2 hover:underline"
                    >
                      {t("View")}
                    </a>
                  ) : (
                    <span className="text-[var(--color-ink)]/40">{t("None")}</span>
                  ),
              },
            ]}
          />
        </Section>
      </div>
    </AdminShell>
  );
}
