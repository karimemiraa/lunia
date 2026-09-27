import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { centerLocalToUtc } from "@/modules/booking/availability";
import { profitAndLoss, accountingDashboard, pnlCsv, splitInvoiceRevenue } from "@/modules/accounting/reports";
import { rangeFromISO } from "@/modules/accounting/periods";
import { cleanup, makeExpense, makeInvoice, makeTag } from "./fixtures";

// March/April 2031: no other suite writes invoices, expenses, stock movements
// or payroll there.
const RANGE = rangeFromISO("2031-03-01", "2031-04-30");
const TAG = makeTag("pnl");

describe("profit & loss", () => {
  let userId: string;
  let productId: string;
  let rentCategory: string;
  let rentCategoryName: string;
  let mktCategoryName: string;

  beforeAll(async () => {
    await prisma.payrollRun.deleteMany({ where: { periodMonth: { in: ["2031-03", "2031-04"] } } });

    const user = await prisma.user.create({ data: { type: "STAFF", email: `${TAG.toLowerCase()}@test.local` } });
    userId = user.id;
    const product = await prisma.product.create({ data: { nameEn: `${TAG} serum`, sku: TAG, costMinor: 4000, priceMinor: 10000 } });
    productId = product.id;
    rentCategoryName = `${TAG} Rent`;
    mktCategoryName = `${TAG} Marketing`;
    rentCategory = (await prisma.expenseCategory.create({ data: { name: rentCategoryName } })).id;
    const mktCategory = (await prisma.expenseCategory.create({ data: { name: mktCategoryName } })).id;

    // March: one invoice (service + product), a credit note stored with
    // NEGATIVE amounts, and a draft + void that must be ignored.
    const invA = await makeInvoice(TAG, {
      dateISO: "2031-03-05",
      lines: [
        { kind: "SERVICE", netMinor: 100_000 },
        { kind: "PRODUCT", productId, netMinor: 20_000 },
      ],
    });
    await makeInvoice(TAG, { dateISO: "2031-03-25", kind: "CREDIT_NOTE", negative: true, originalInvoiceId: invA.id, lines: [{ kind: "SERVICE", netMinor: 10_000 }] });
    await makeInvoice(TAG, { dateISO: "2031-03-20", status: "DRAFT", lines: [{ netMinor: 999_000 }] });
    await makeInvoice(TAG, { dateISO: "2031-03-21", status: "VOID", lines: [{ netMinor: 999_000 }] });
    // April: a paid invoice and a credit note stored with POSITIVE amounts.
    await makeInvoice(TAG, { dateISO: "2031-04-10", status: "PAID", lines: [{ kind: "SERVICE", netMinor: 50_000 }] });
    await makeInvoice(TAG, { dateISO: "2031-04-12", kind: "CREDIT_NOTE", lines: [{ kind: "PRODUCT", productId, netMinor: 5_000 }] });
    // Outside the range.
    await makeInvoice(TAG, { dateISO: "2031-05-01", lines: [{ netMinor: 777_000 }] });

    // COGS: 2 sold at product cost (40.00), 3 consumed at 5.00, 1 returned
    // against an invoice at 40.00; a purchase is not a cost.
    await prisma.stockMovement.createMany({
      data: [
        { productId, qty: -2, type: "SALE", refType: "INVOICE", createdAt: centerLocalToUtc("2031-03-05", 720) },
        { productId, qty: -3, type: "CONSUMPTION", refType: "APPOINTMENT", unitCostMinor: 500, createdAt: centerLocalToUtc("2031-04-02", 720) },
        { productId, qty: 1, type: "RETURN", refType: "INVOICE", unitCostMinor: 4000, createdAt: centerLocalToUtc("2031-04-12", 720) },
        { productId, qty: 50, type: "PURCHASE", refType: "PURCHASE_ORDER", unitCostMinor: 4000, createdAt: centerLocalToUtc("2031-03-02", 720) },
      ],
    });

    await makeExpense(TAG, { dateISO: "2031-03-01", amountMinor: 30_000, vatMinor: 4_500, categoryId: rentCategory });
    await makeExpense(TAG, { dateISO: "2031-04-15", amountMinor: 10_000, vatMinor: 1_500, categoryId: mktCategory });
    await makeExpense(TAG, { dateISO: "2031-04-30", amountMinor: 2_000, vatMinor: 0 });

    // Payroll: March approved (counted), April draft (ignored).
    await prisma.payrollRun.create({
      data: {
        periodMonth: "2031-03",
        status: "APPROVED",
        createdById: userId,
        payslips: { create: [{ userId, basicMinor: 600_000, netMinor: 500_000, gosiEmployeeMinor: 50_000, gosiEmployerMinor: 60_000, deductionsMinor: 50_000 }] },
      },
    });
    await prisma.payrollRun.create({
      data: { periodMonth: "2031-04", status: "DRAFT", createdById: userId, payslips: { create: [{ userId, netMinor: 900_000 }] } },
    });
  });

  afterAll(async () => {
    await cleanup(TAG);
    await prisma.payrollRun.deleteMany({ where: { periodMonth: { in: ["2031-03", "2031-04"] } } });
    await prisma.product.deleteMany({ where: { sku: TAG } });
    await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: TAG } } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("nets credit notes (either sign) out of revenue per month and splits services vs products", async () => {
    const pnl = await profitAndLoss(RANGE);
    const [mar, apr] = pnl.months;
    expect(pnl.months.map((m) => m.month)).toEqual(["2031-03", "2031-04"]);

    expect(mar.servicesMinor).toBe(90_000);
    expect(mar.productsMinor).toBe(20_000);
    expect(mar.otherRevenueMinor).toBe(0);
    expect(mar.revenueMinor).toBe(110_000);

    expect(apr.servicesMinor).toBe(50_000);
    expect(apr.productsMinor).toBe(-5_000);
    expect(apr.revenueMinor).toBe(45_000);
  });

  it("computes COGS, expenses by category, payroll incl. employer GOSI and net", async () => {
    const pnl = await profitAndLoss(RANGE);
    const [mar, apr] = pnl.months;

    expect(mar.cogsProductsMinor).toBe(8_000);
    expect(mar.cogsConsumablesMinor).toBe(0);
    expect(mar.grossProfitMinor).toBe(102_000);
    expect(mar.expensesByCategory[rentCategoryName]).toBe(30_000);
    expect(mar.expensesMinor).toBe(30_000);
    // net 500,000 + employee GOSI 50,000 + employer GOSI 60,000
    expect(mar.payrollMinor).toBe(610_000);
    expect(mar.netMinor).toBe(110_000 - 8_000 - 30_000 - 610_000);

    expect(apr.cogsProductsMinor).toBe(-4_000);
    expect(apr.cogsConsumablesMinor).toBe(1_500);
    expect(apr.grossProfitMinor).toBe(45_000 + 2_500);
    expect(apr.expensesByCategory[mktCategoryName]).toBe(10_000);
    expect(apr.expensesByCategory.Uncategorized).toBe(2_000);
    expect(apr.payrollMinor).toBe(0);
    expect(apr.netMinor).toBe(47_500 - 12_000);

    expect(pnl.total.revenueMinor).toBe(155_000);
    expect(pnl.total.netMinor).toBe(mar.netMinor + apr.netMinor);
    expect(pnl.categories).toEqual(expect.arrayContaining([rentCategoryName, mktCategoryName, "Uncategorized"]));
  });

  it("dashboard revenue, credit notes and gross profit agree with the P&L", async () => {
    const d = await accountingDashboard(RANGE, RANGE, centerLocalToUtc("2031-05-01", 0));
    expect(d.invoicedNetMinor).toBe(170_000);
    expect(d.creditNotesNetMinor).toBe(15_000);
    expect(d.revenueMinor).toBe(155_000);
    expect(d.invoiceCount).toBe(2);
    expect(d.cogsMinor).toBe(8_000 + 1_500 - 4_000);
    expect(d.grossProfitMinor).toBe(155_000 - 5_500);
    expect(d.outputVatMinor).toBe(25_500 - 2_250);
    expect(d.expensesMinor).toBe(42_000);
    expect(d.inputVatMinor).toBe(6_000);
    expect(d.trend.map((t) => t.month)).toEqual(["2031-03", "2031-04"]);
  });

  it("exports the P&L with a total row and SAR strings", async () => {
    const csv = pnlCsv(await profitAndLoss(RANGE));
    const total = csv.rows.at(-1)!;
    expect(total.month).toBe("Total");
    expect(total.revenue).toBe("1550.00");
    expect(csv.columns.some((c) => c.label === `${rentCategoryName} (SAR)`)).toBe(true);
  });

  it("puts unexplained header amounts (invoice-level discount) in other revenue", () => {
    const split = splitInvoiceRevenue({
      kind: "INVOICE",
      totalMinor: 103_500,
      vatMinor: 13_500,
      lines: [
        { kind: "SERVICE", totalMinor: 80_500, vatMinor: 10_500 },
        { kind: "PRODUCT", totalMinor: 34_500, vatMinor: 4_500 },
      ],
    });
    expect(split).toEqual({ servicesMinor: 70_000, productsMinor: 30_000, otherMinor: -10_000, netMinor: 90_000 });
  });
});
