import { describe, it, expect } from "vitest";
import {
  allocate,
  computeInvoiceTotals,
  computeLine,
  divRoundHalfUp,
  exclusiveOf,
  inclusiveEditorValues,
  invoiceDiscountFromInclusive,
  lineFromInclusive,
  parseSarToMinor,
  formatAmount,
  vatOf,
} from "@/modules/billing/money";

describe("billing/money rounding", () => {
  it("rounds half away from zero with integers only", () => {
    expect(divRoundHalfUp(15, 10)).toBe(2);
    expect(divRoundHalfUp(14, 10)).toBe(1);
    expect(divRoundHalfUp(-15, 10)).toBe(-2);
    expect(divRoundHalfUp(25, 10)).toBe(3); // not banker's rounding
  });

  it("VAT 15% per line rounds to the halala", () => {
    expect(vatOf(43478, 1500)).toBe(6522); // 6521.7
    expect(vatOf(10870, 1500)).toBe(1631); // 1630.5 → half up
    expect(vatOf(10869, 1500)).toBe(1630); // 1630.35
    expect(vatOf(3, 1500)).toBe(0); // 0.45
    expect(vatOf(4, 1500)).toBe(1); // 0.6
  });

  it("computes a line: net = unit × qty − discount; VAT on net", () => {
    expect(computeLine({ qty: 3, unitPriceMinor: 10_000, discountMinor: 1_000, vatRateBp: 1500 })).toEqual({
      netMinor: 29_000,
      vatMinor: 4_350,
      totalMinor: 33_350,
    });
    expect(() => computeLine({ qty: 1, unitPriceMinor: 100, discountMinor: 101, vatRateBp: 1500 })).toThrow();
    expect(() => computeLine({ qty: 0, unitPriceMinor: 100, discountMinor: 0, vatRateBp: 1500 })).toThrow();
  });
});

describe("billing/money VAT-inclusive prices", () => {
  it("500.00 SAR inclusive → 434.78 + 65.22, total exact", () => {
    const l = lineFromInclusive({ unitInclMinor: 50_000, qty: 1, vatRateBp: 1500 });
    expect(l).toEqual({ unitPriceMinor: 43_478, discountMinor: 0, grossMinor: 50_000 });
    expect(computeLine({ qty: 1, vatRateBp: 1500, ...l })).toEqual({ netMinor: 43_478, vatMinor: 6_522, totalMinor: 50_000 });
  });

  it("125.00 SAR has no exact net — falls back to the tax fraction, total still exact", () => {
    // net 10870 → 12501; net 10869 → 12499: 12500 is unreachable with round(net×15%).
    const l = lineFromInclusive({ unitInclMinor: 12_500, qty: 1, vatRateBp: 1500 });
    const c = computeLine({ qty: 1, vatRateBp: 1500, ...l });
    expect(c.totalMinor).toBe(12_500);
    expect(c.netMinor).toBe(exclusiveOf(12_500, 1500)); // 10870
    expect(Math.abs(c.vatMinor - vatOf(c.netMinor, 1500))).toBeLessThanOrEqual(1);
  });

  it("keeps every whole-riyal price exact from 1 to 5,000 SAR, qty 1..3", () => {
    for (let sar = 1; sar <= 5000; sar += 7) {
      for (const qty of [1, 2, 3]) {
        const l = lineFromInclusive({ unitInclMinor: sar * 100, qty, vatRateBp: 1500 });
        expect(l.discountMinor).toBeGreaterThanOrEqual(0);
        expect(computeLine({ qty, vatRateBp: 1500, ...l }).totalMinor).toBe(sar * 100 * qty);
      }
    }
  });

  it("round-trips stored lines back to the editor's inclusive values", () => {
    for (const [unit, qty, disc] of [
      [50_000, 1, 0],
      [12_500, 1, 0],
      [9_999, 3, 500],
      [12_500, 2, 0],
    ] as const) {
      const l = lineFromInclusive({ unitInclMinor: unit, qty, discountInclMinor: disc, vatRateBp: 1500 });
      const c = computeLine({ qty, vatRateBp: 1500, ...l });
      const back = inclusiveEditorValues({ qty, vatRateBp: 1500, ...l, totalMinor: c.totalMinor });
      expect(back.unitInclMinor * qty - back.discountInclMinor).toBe(c.totalMinor);
    }
  });
});

describe("billing/money invoice totals", () => {
  it("two 500 SAR services total 1,000.00, not 999.99 (per-line rounding)", () => {
    const l = lineFromInclusive({ unitInclMinor: 50_000, qty: 1, vatRateBp: 1500 });
    const t = computeInvoiceTotals([
      { qty: 1, vatRateBp: 1500, ...l },
      { qty: 1, vatRateBp: 1500, ...l },
    ]);
    expect(t.totalMinor).toBe(100_000);
    expect(t.vatMinor).toBe(13_044);
    expect(t.subtotalMinor).toBe(86_956);
  });

  it("allocates an invoice discount pro rata with largest remainder", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    const t = computeInvoiceTotals(
      [
        { qty: 1, unitPriceMinor: 30_000, discountMinor: 0, vatRateBp: 1500 },
        { qty: 1, unitPriceMinor: 10_000, discountMinor: 0, vatRateBp: 0 },
      ],
      4_000,
    );
    expect(t.lines.map((l) => l.invoiceDiscountShareMinor)).toEqual([3_000, 1_000]);
    expect(t.taxableMinor).toBe(36_000);
    expect(t.vatMinor).toBe(4_050); // 27,000 × 15% + 9,000 × 0%
    expect(t.totalMinor).toBe(40_050);
    expect(t.groups).toEqual([
      { vatRateBp: 1500, taxableMinor: 27_000, vatMinor: 4_050 },
      { vatRateBp: 0, taxableMinor: 9_000, vatMinor: 0 },
    ]);
  });

  it("rejects an invoice discount above the subtotal", () => {
    expect(() => computeInvoiceTotals([{ qty: 1, unitPriceMinor: 100, discountMinor: 0, vatRateBp: 1500 }], 101)).toThrow();
  });

  it("converts an inclusive invoice discount so the total drops by exactly that amount", () => {
    const l = lineFromInclusive({ unitInclMinor: 50_000, qty: 1, vatRateBp: 1500 });
    const lines = [{ qty: 1, vatRateBp: 1500, ...l }];
    const d = invoiceDiscountFromInclusive(lines, 5_000);
    expect(computeInvoiceTotals(lines, d).totalMinor).toBe(45_000);
  });
});

describe("billing/money format/parse", () => {
  it("formats and parses SAR amounts", () => {
    expect(formatAmount(123_456)).toBe("1,234.56");
    expect(formatAmount(-5)).toBe("-0.05");
    expect(parseSarToMinor("1,234.5")).toBe(123_450);
    expect(parseSarToMinor("12")).toBe(1_200);
    expect(parseSarToMinor("1.234")).toBeNull();
    expect(parseSarToMinor("abc")).toBeNull();
  });
});
