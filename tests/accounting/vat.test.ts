import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { vatSummary, vatCsv } from "@/modules/accounting/reports";
import { rangeFromISO, periodsInRange, quarterKeyOfMonth } from "@/modules/accounting/periods";
import { cleanup, makeExpense, makeInvoice, makeTag } from "./fixtures";

// Q3 2031 is reserved for this suite.
const RANGE = rangeFromISO("2031-07-01", "2031-09-30");
const TAG = makeTag("vat");

describe("VAT return summary", () => {
  beforeAll(async () => {
    await makeInvoice(TAG, { dateISO: "2031-07-10", lines: [{ netMinor: 200_000 }] }); // VAT 30,000
    await makeInvoice(TAG, { dateISO: "2031-08-15", lines: [{ netMinor: 50_000, vatMinor: 0 }] }); // zero-rated
    await makeInvoice(TAG, { dateISO: "2031-08-20", kind: "CREDIT_NOTE", negative: true, lines: [{ netMinor: 20_000 }] }); // VAT 3,000
    await makeInvoice(TAG, { dateISO: "2031-08-21", status: "VOID", lines: [{ netMinor: 500_000 }] });
    await makeInvoice(TAG, { dateISO: "2031-10-01", lines: [{ netMinor: 500_000 }] }); // next quarter
    await makeExpense(TAG, { dateISO: "2031-07-05", amountMinor: 60_000, vatMinor: 9_000 });
    await makeExpense(TAG, { dateISO: "2031-09-01", amountMinor: 40_000, vatMinor: 0 });
  });

  afterAll(async () => {
    await cleanup(TAG);
  });

  it("summarizes a quarter: output VAT less credit notes, input VAT, net payable", async () => {
    const summary = await vatSummary(RANGE, "quarter");
    expect(summary.rows).toHaveLength(1);
    const q = summary.rows[0];
    expect(q.period).toBe("2031-Q3");
    expect(q.standardSalesMinor).toBe(200_000);
    expect(q.standardVatMinor).toBe(30_000);
    expect(q.zeroRatedSalesMinor).toBe(50_000);
    expect(q.creditNotesNetMinor).toBe(20_000);
    expect(q.creditNotesVatMinor).toBe(3_000);
    expect(q.outputVatMinor).toBe(27_000);
    expect(q.purchasesMinor).toBe(60_000);
    expect(q.inputVatMinor).toBe(9_000);
    expect(q.nonVatPurchasesMinor).toBe(40_000);
    expect(q.netVatMinor).toBe(18_000);
    expect(summary.total.netVatMinor).toBe(18_000);
  });

  it("breaks the same figures down by month (a month can be a net refund)", async () => {
    const summary = await vatSummary(RANGE, "month");
    expect(summary.rows.map((r) => r.period)).toEqual(["2031-07", "2031-08", "2031-09"]);
    const [jul, aug, sep] = summary.rows;
    expect(jul.netVatMinor).toBe(30_000 - 9_000);
    expect(aug.outputVatMinor).toBe(-3_000);
    expect(aug.netVatMinor).toBe(-3_000);
    expect(sep.netVatMinor).toBe(0);
    expect(sep.nonVatPurchasesMinor).toBe(40_000);
    expect(summary.total.netVatMinor).toBe(jul.netVatMinor + aug.netVatMinor + sep.netVatMinor);
  });

  it("exports a total row", async () => {
    const csv = vatCsv(await vatSummary(RANGE, "month"));
    expect(csv.rows.at(-1)).toMatchObject({ period: "Total", outputVat: "270.00", inputVat: "90.00", netVat: "180.00" });
  });

  it("maps months to calendar quarters", () => {
    expect(quarterKeyOfMonth("2031-01")).toBe("2031-Q1");
    expect(quarterKeyOfMonth("2031-03")).toBe("2031-Q1");
    expect(quarterKeyOfMonth("2031-04")).toBe("2031-Q2");
    expect(quarterKeyOfMonth("2031-12")).toBe("2031-Q4");
    expect(periodsInRange("2031-02-10", "2031-11-02", "quarter")).toEqual(["2031-Q1", "2031-Q2", "2031-Q3", "2031-Q4"]);
    expect(periodsInRange("2031-11-10", "2032-01-02", "month")).toEqual(["2031-11", "2031-12", "2032-01"]);
  });
});
