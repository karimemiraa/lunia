// Expenses and expense categories. Amounts are halalas: `amountMinor` is the
// amount EXCLUDING VAT, `vatMinor` the recoverable input VAT on the vendor's
// tax invoice (0 for non-VAT-registered vendors, government fees, salaries).
// Receipts live in private storage (see receipts.ts); this module only keeps
// the key on the row.

import { z } from "zod";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { centerLocalToUtc } from "@/modules/booking/availability";
import { dateISOOf, minorToSarString, type AccountingRange } from "./periods";
import type { CsvColumn } from "@/modules/reports/csv";

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Rent",
  "Salaries",
  "Products & consumables",
  "Utilities",
  "Marketing",
  "Maintenance",
  "Government fees",
  "Software",
  "Other",
] as const;

export const PAYMENT_METHODS: PaymentMethod[] = [
  "CASH",
  "CARD",
  "MADA",
  "APPLE_PAY",
  "BANK_TRANSFER",
  "GIFT_CARD",
  "PACKAGE",
  "ONLINE",
  "OTHER",
];

/** Methods that make sense for paying a vendor (gift cards/packages don't). */
export const EXPENSE_METHODS: PaymentMethod[] = ["BANK_TRANSFER", "CARD", "MADA", "CASH", "APPLE_PAY", "ONLINE", "OTHER"];

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  MADA: "mada",
  APPLE_PAY: "Apple Pay",
  BANK_TRANSFER: "Bank transfer",
  GIFT_CARD: "Gift card",
  PACKAGE: "Package",
  ONLINE: "Online",
  OTHER: "Other",
};

// ---- Categories ------------------------------------------------------------

/**
 * Seeds the default categories the first time the table is empty. Once staff
 * have any category (even after renaming/deleting the defaults) it never
 * re-seeds, so a deliberate cleanup is respected.
 */
export async function ensureDefaultCategories(db: Pick<Prisma.TransactionClient, "expenseCategory"> = prisma): Promise<void> {
  const count = await db.expenseCategory.count();
  if (count > 0) return;
  await db.expenseCategory.createMany({
    data: DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ name })),
    skipDuplicates: true,
  });
}

export async function listExpenseCategories(): Promise<{ id: string; name: string }[]> {
  await ensureDefaultCategories();
  const rows = await prisma.expenseCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  // Keep "Other" last so the picker reads naturally.
  return [...rows.filter((r) => r.name !== "Other"), ...rows.filter((r) => r.name === "Other")];
}

/** Finds a category by case-insensitive name or creates it. */
export async function findOrCreateCategory(name: string): Promise<string> {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) throw new Error("Category name is required.");
  const existing = await prisma.expenseCategory.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } });
  if (existing) return existing.id;
  const created = await prisma.expenseCategory.create({ data: { name: trimmed } });
  return created.id;
}

// ---- Validation --------------------------------------------------------------

export const expenseInputSchema = z
  .object({
    categoryId: z.string().trim().min(1).nullable().optional(),
    vendor: z.string().trim().max(160).optional().transform((v) => v || null),
    description: z.string().trim().min(1, "Description is required.").max(500),
    amountMinor: z.number().int().min(0, "Amount can't be negative.").max(10_000_000_000),
    vatMinor: z.number().int().min(0, "VAT can't be negative.").max(10_000_000_000),
    paidDateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date."),
    method: z.enum(PAYMENT_METHODS as [PaymentMethod, ...PaymentMethod[]]),
    reference: z.string().trim().max(120).optional().transform((v) => v || null),
  })
  .refine((v) => v.amountMinor + v.vatMinor > 0, { message: "Enter an amount.", path: ["amountMinor"] })
  // Guard against a typo like VAT entered as the gross: input VAT on a 15%
  // tax invoice can never exceed the net amount.
  .refine((v) => v.vatMinor <= v.amountMinor, { message: "VAT can't be more than the amount.", path: ["vatMinor"] });

export type ExpenseInput = z.input<typeof expenseInputSchema>;

function toData(input: z.output<typeof expenseInputSchema>) {
  return {
    categoryId: input.categoryId ?? null,
    vendor: input.vendor,
    description: input.description,
    amountMinor: input.amountMinor,
    vatMinor: input.vatMinor,
    // Noon center-local: an unambiguous day bucket whatever the report range.
    paidAt: centerLocalToUtc(input.paidDateISO, 720),
    method: input.method,
    reference: input.reference,
  };
}

// ---- CRUD --------------------------------------------------------------------

export async function createExpense(input: ExpenseInput, opts: { createdById?: string; attachmentKey?: string | null } = {}) {
  const parsed = expenseInputSchema.parse(input);
  return prisma.expense.create({
    data: { ...toData(parsed), createdById: opts.createdById ?? null, attachmentKey: opts.attachmentKey ?? null },
  });
}

/**
 * Updates an expense. `attachmentKey` undefined = keep the current receipt;
 * a string = replace it; null = remove it. A replaced/removed receipt blob is
 * deleted from storage after the row is saved.
 */
export async function updateExpense(id: string, input: ExpenseInput, opts: { attachmentKey?: string | null } = {}) {
  const parsed = expenseInputSchema.parse(input);
  const existing = await prisma.expense.findUniqueOrThrow({ where: { id } });
  const data: Prisma.ExpenseUncheckedUpdateInput = toData(parsed);
  if (opts.attachmentKey !== undefined) data.attachmentKey = opts.attachmentKey;
  const updated = await prisma.expense.update({ where: { id }, data });
  if (opts.attachmentKey !== undefined && existing.attachmentKey && existing.attachmentKey !== opts.attachmentKey) {
    await storage.delete(existing.attachmentKey).catch(() => undefined);
  }
  return updated;
}

export async function deleteExpense(id: string) {
  const existing = await prisma.expense.delete({ where: { id } });
  if (existing.attachmentKey) await storage.delete(existing.attachmentKey).catch(() => undefined);
  return existing;
}

export async function getExpense(id: string) {
  return prisma.expense.findUnique({ where: { id }, include: { category: { select: { id: true, name: true } } } });
}

// ---- Listing, totals, CSV -------------------------------------------------------

export interface ExpenseFilter {
  range: Pick<AccountingRange, "from" | "to">;
  categoryId?: string;
  method?: PaymentMethod;
  search?: string;
}

export interface ExpenseRow {
  id: string;
  dateISO: string;
  category: string;
  vendor: string | null;
  description: string;
  amountMinor: number;
  vatMinor: number;
  totalMinor: number;
  method: PaymentMethod;
  reference: string | null;
  hasReceipt: boolean;
}

export interface ExpenseTotals {
  count: number;
  amountMinor: number;
  vatMinor: number;
  totalMinor: number;
  byCategory: { category: string; amountMinor: number; vatMinor: number }[];
}

function whereFor(filter: ExpenseFilter): Prisma.ExpenseWhereInput {
  const search = filter.search?.trim();
  return {
    paidAt: { gte: filter.range.from, lt: filter.range.to },
    ...(filter.categoryId === "none" ? { categoryId: null } : filter.categoryId ? { categoryId: filter.categoryId } : {}),
    ...(filter.method ? { method: filter.method } : {}),
    ...(search
      ? {
          OR: [
            { vendor: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
            { reference: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export async function listExpenses(filter: ExpenseFilter): Promise<{ rows: ExpenseRow[]; totals: ExpenseTotals }> {
  const expenses = await prisma.expense.findMany({
    where: whereFor(filter),
    include: { category: { select: { name: true } } },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
  });
  const rows: ExpenseRow[] = expenses.map((e) => ({
    id: e.id,
    dateISO: dateISOOf(e.paidAt),
    category: e.category?.name ?? "Uncategorized",
    vendor: e.vendor,
    description: e.description,
    amountMinor: e.amountMinor,
    vatMinor: e.vatMinor,
    totalMinor: e.amountMinor + e.vatMinor,
    method: e.method,
    reference: e.reference,
    hasReceipt: Boolean(e.attachmentKey),
  }));
  return { rows, totals: summarizeExpenses(rows) };
}

/** Pure totals over already-loaded rows (exported for tests). */
export function summarizeExpenses(rows: Pick<ExpenseRow, "category" | "amountMinor" | "vatMinor">[]): ExpenseTotals {
  const byCategory = new Map<string, { amountMinor: number; vatMinor: number }>();
  let amountMinor = 0;
  let vatMinor = 0;
  for (const row of rows) {
    amountMinor += row.amountMinor;
    vatMinor += row.vatMinor;
    const bucket = byCategory.get(row.category) ?? { amountMinor: 0, vatMinor: 0 };
    bucket.amountMinor += row.amountMinor;
    bucket.vatMinor += row.vatMinor;
    byCategory.set(row.category, bucket);
  }
  return {
    count: rows.length,
    amountMinor,
    vatMinor,
    totalMinor: amountMinor + vatMinor,
    byCategory: [...byCategory.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.amountMinor - a.amountMinor),
  };
}

export const EXPENSE_CSV_COLUMNS: CsvColumn[] = [
  { key: "date", label: "Date" },
  { key: "category", label: "Category" },
  { key: "vendor", label: "Vendor" },
  { key: "description", label: "Description" },
  { key: "amount", label: "Amount excl. VAT (SAR)" },
  { key: "vat", label: "Input VAT (SAR)" },
  { key: "total", label: "Total (SAR)" },
  { key: "method", label: "Method" },
  { key: "reference", label: "Reference" },
  { key: "receipt", label: "Receipt" },
];

export function expenseCsvRows(rows: ExpenseRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    date: r.dateISO,
    category: r.category,
    vendor: r.vendor ?? "",
    description: r.description,
    amount: minorToSarString(r.amountMinor),
    vat: minorToSarString(r.vatMinor),
    total: minorToSarString(r.totalMinor),
    method: METHOD_LABELS[r.method],
    reference: r.reference ?? "",
    receipt: r.hasReceipt ? "Yes" : "No",
  }));
}
