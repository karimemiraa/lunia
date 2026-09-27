import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { isPrivateStorageKey, storage } from "@/lib/storage";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  createExpense,
  ensureDefaultCategories,
  expenseCsvRows,
  findOrCreateCategory,
  listExpenses,
  summarizeExpenses,
  updateExpense,
  deleteExpense,
} from "@/modules/accounting/expenses";
import { checkReceiptFile, storeReceipt } from "@/modules/accounting/receipts";
import { parseSarToMinor, rangeFromISO, vatOn, minorToSarString } from "@/modules/accounting/periods";
import { toCsv } from "@/modules/reports/csv";
import { makeTag } from "./fixtures";

// November 2031 is reserved for this suite.
const RANGE = rangeFromISO("2031-11-01", "2031-11-30");
const TAG = makeTag("exp");

describe("expenses", () => {
  const categoryNames: string[] = [];

  afterAll(async () => {
    const leftovers = await prisma.expense.findMany({ where: { vendor: TAG } });
    for (const e of leftovers) await deleteExpense(e.id);
    await prisma.expenseCategory.deleteMany({ where: { name: { in: categoryNames } } });
  });

  it("seeds the default categories only when there are none", async () => {
    // Run against an emptied table inside a transaction that is rolled back,
    // so real categories are never touched.
    const rollback = new Error("rollback");
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.expenseCategory.deleteMany({});
        await ensureDefaultCategories(tx);
        const names = (await tx.expenseCategory.findMany()).map((c) => c.name).sort();
        expect(names).toEqual([...DEFAULT_EXPENSE_CATEGORIES].sort());
        await tx.expenseCategory.delete({ where: { name: "Other" } });
        await ensureDefaultCategories(tx);
        expect(await tx.expenseCategory.count()).toBe(DEFAULT_EXPENSE_CATEGORIES.length - 1);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it("records expenses and totals amount, input VAT and gross by category", async () => {
    const rentName = `${TAG} Rent`;
    const utilName = `${TAG} Utilities`;
    categoryNames.push(rentName, utilName);
    const rent = await findOrCreateCategory(rentName);
    expect(await findOrCreateCategory(rentName.toUpperCase())).toBe(rent);
    const util = await findOrCreateCategory(utilName);

    const base = { vendor: TAG, method: "BANK_TRANSFER" as const, reference: "" };
    await createExpense({ ...base, categoryId: rent, description: "November rent", amountMinor: 1_500_000, vatMinor: vatOn(1_500_000), paidDateISO: "2031-11-01" });
    await createExpense({ ...base, categoryId: util, description: "Electricity", amountMinor: 83_333, vatMinor: vatOn(83_333), paidDateISO: "2031-11-12" });
    await createExpense({ ...base, categoryId: null, description: "Commercial register renewal", amountMinor: 20_000, vatMinor: 0, paidDateISO: "2031-11-30" });
    // Outside the range.
    await createExpense({ ...base, categoryId: rent, description: "December rent", amountMinor: 1_500_000, vatMinor: 225_000, paidDateISO: "2031-12-01" });

    const { rows, totals } = await listExpenses({ range: RANGE, search: TAG });
    expect(rows).toHaveLength(3);
    expect(vatOn(83_333)).toBe(12_500);
    expect(totals.amountMinor).toBe(1_500_000 + 83_333 + 20_000);
    expect(totals.vatMinor).toBe(225_000 + 12_500);
    expect(totals.totalMinor).toBe(totals.amountMinor + totals.vatMinor);
    expect(totals.byCategory.map((c) => c.category)).toEqual([rentName, utilName, "Uncategorized"]);

    const onlyRent = await listExpenses({ range: RANGE, search: TAG, categoryId: rent });
    expect(onlyRent.totals.vatMinor).toBe(225_000);
    const uncategorized = await listExpenses({ range: RANGE, search: TAG, categoryId: "none" });
    expect(uncategorized.rows.map((r) => r.description)).toEqual(["Commercial register renewal"]);

    const csv = toCsv([{ key: "vat", label: "VAT" }, { key: "total", label: "Total" }], expenseCsvRows(rows));
    expect(csv).toContain("2250.00,17250.00");
  });

  it("validates amounts and VAT", async () => {
    const base = { vendor: TAG, description: "x", paidDateISO: "2031-11-05", method: "CASH" as const };
    await expect(createExpense({ ...base, amountMinor: 1_000, vatMinor: 2_000 })).rejects.toThrow(/VAT can't be more/);
    await expect(createExpense({ ...base, amountMinor: 0, vatMinor: 0 })).rejects.toThrow(/Enter an amount/);
    await expect(createExpense({ ...base, amountMinor: -5, vatMinor: 0 })).rejects.toThrow();
    await expect(createExpense({ ...base, amountMinor: 100, vatMinor: 15, paidDateISO: "11/05/2031" })).rejects.toThrow();

    expect(parseSarToMinor("1,234.5")).toBe(123_450);
    expect(parseSarToMinor("99.99")).toBe(9_999);
    expect(parseSarToMinor("250")).toBe(25_000);
    expect(parseSarToMinor("1.234")).toBeNull();
    expect(parseSarToMinor("-5")).toBeNull();
    expect(parseSarToMinor("abc")).toBeNull();
    expect(minorToSarString(-1_005)).toBe("-10.05");
  });

  it("keeps receipts private and deletes them with the expense", async () => {
    expect(checkReceiptFile({ type: "image/svg+xml", size: 10 }).ok).toBe(false);
    expect(checkReceiptFile({ type: "application/pdf", size: 11 * 1024 * 1024 }).ok).toBe(false);
    const ok = checkReceiptFile({ type: "application/pdf", size: 1000 });
    expect(ok.ok).toBe(true);

    const key = await storeReceipt(Buffer.from("%PDF-1.4 test"), "application/pdf", "pdf");
    expect(key.startsWith("finance/receipts/")).toBe(true);
    expect(isPrivateStorageKey(key)).toBe(true);
    expect(isPrivateStorageKey(`./${key}`)).toBe(true);
    expect(isPrivateStorageKey(`Finance//receipts/x.pdf`)).toBe(true);
    expect(isPrivateStorageKey("media/abc.jpg")).toBe(false);

    const expense = await createExpense(
      { vendor: TAG, description: "With receipt", amountMinor: 1_000, vatMinor: 150, paidDateISO: "2031-11-06", method: "CARD" },
      { attachmentKey: key },
    );
    // Replacing the receipt removes the old blob.
    const key2 = await storeReceipt(Buffer.from("%PDF-1.4 second"), "application/pdf", "pdf");
    await updateExpense(expense.id, { vendor: TAG, description: "With receipt", amountMinor: 1_000, vatMinor: 150, paidDateISO: "2031-11-06", method: "CARD" }, { attachmentKey: key2 });
    expect(await storage.get(key)).toBeNull();
    expect((await storage.get(key2))?.contentType).toBe("application/pdf");

    await deleteExpense(expense.id);
    expect(await storage.get(key2)).toBeNull();
  });

  it("summarizes rows without touching the DB", () => {
    const t = summarizeExpenses([
      { category: "A", amountMinor: 100, vatMinor: 15 },
      { category: "B", amountMinor: 300, vatMinor: 0 },
      { category: "A", amountMinor: 50, vatMinor: 7 },
    ]);
    expect(t).toMatchObject({ count: 3, amountMinor: 450, vatMinor: 22, totalMinor: 472 });
    expect(t.byCategory).toEqual([
      { category: "B", amountMinor: 300, vatMinor: 0 },
      { category: "A", amountMinor: 150, vatMinor: 22 },
    ]);
  });
});
