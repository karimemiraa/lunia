// Parses the expenses list's GET filters (shared by the page and the CSV
// export so both always resolve the same link to the same rows).

import type { PaymentMethod } from "@prisma/client";
import { resolveAccountingRange, type AccountingRange } from "@/modules/accounting/periods";
import { PAYMENT_METHODS, type ExpenseFilter } from "@/modules/accounting/expenses";

export interface ParsedExpenseFilter extends ExpenseFilter {
  range: AccountingRange;
}

export function parseExpenseFilterParams(params: URLSearchParams | Record<string, string | undefined>): ParsedExpenseFilter {
  const get = (key: string) => (params instanceof URLSearchParams ? params.get(key) : params[key]) ?? undefined;
  const method = get("method");
  const categoryId = get("category")?.trim();
  return {
    range: resolveAccountingRange(get("from"), get("to")),
    categoryId: categoryId && /^[a-z0-9]+$/i.test(categoryId) ? categoryId : undefined,
    method: method && (PAYMENT_METHODS as string[]).includes(method) ? (method as PaymentMethod) : undefined,
    search: get("q")?.trim().slice(0, 100) || undefined,
  };
}

export function expenseFilterQuery(filter: ParsedExpenseFilter): URLSearchParams {
  const qs = new URLSearchParams({ from: filter.range.fromISO, to: filter.range.toISO });
  if (filter.categoryId) qs.set("category", filter.categoryId);
  if (filter.method) qs.set("method", filter.method);
  if (filter.search) qs.set("q", filter.search);
  return qs;
}
