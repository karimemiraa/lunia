import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { centerLocalToUtc } from "@/modules/booking/availability";
import { agingBucketFor, receivablesAging } from "@/modules/accounting/reports";
import { cleanup, makeInvoice, makeTag } from "./fixtures";

const TAG = makeTag("aging");
const AS_OF = centerLocalToUtc("2031-12-31", 720);

describe("receivables aging", () => {
  beforeAll(async () => {
    // 10 days old, partly paid: 1,150.00 - 150.00 = 1,000.00 outstanding.
    await makeInvoice(TAG, { dateISO: "2031-12-21", status: "PARTIALLY_PAID", paidMinor: 15_000, lines: [{ netMinor: 100_000 }] });
    // 46 days old, unpaid: 230.00.
    await makeInvoice(TAG, { dateISO: "2031-11-15", lines: [{ netMinor: 20_000 }] });
    // 82 days old: 115.00.
    await makeInvoice(TAG, { dateISO: "2031-10-10", lines: [{ netMinor: 10_000 }] });
    // 213 days old, partly credited (negative-stored credit note): 575.00 - 115.00 = 460.00.
    const old = await makeInvoice(TAG, { dateISO: "2031-06-01", lines: [{ netMinor: 50_000 }] });
    await makeInvoice(TAG, { dateISO: "2031-06-15", kind: "CREDIT_NOTE", negative: true, originalInvoiceId: old.id, lines: [{ netMinor: 10_000 }] });
    // Fully credited (positive-stored credit note): nothing outstanding.
    const credited = await makeInvoice(TAG, { dateISO: "2031-09-01", lines: [{ netMinor: 30_000 }] });
    await makeInvoice(TAG, { dateISO: "2031-09-02", kind: "CREDIT_NOTE", originalInvoiceId: credited.id, lines: [{ netMinor: 30_000 }] });
    // Excluded: paid, draft, void, and issued after the as-of date.
    await makeInvoice(TAG, { dateISO: "2031-12-01", status: "PAID", paidMinor: 11_500, lines: [{ netMinor: 10_000 }] });
    await makeInvoice(TAG, { dateISO: "2031-12-01", status: "DRAFT", lines: [{ netMinor: 10_000 }] });
    await makeInvoice(TAG, { dateISO: "2031-12-01", status: "VOID", lines: [{ netMinor: 10_000 }] });
    await makeInvoice(TAG, { dateISO: "2032-01-05", lines: [{ netMinor: 10_000 }] });
  });

  afterAll(async () => {
    await cleanup(TAG);
  });

  it("buckets outstanding balances by age since issue", async () => {
    const aging = await receivablesAging(AS_OF);
    const mine = aging.rows.filter((r) => r.number.startsWith(TAG));
    expect(mine.map((r) => [r.ageDays, r.bucket, r.outstandingMinor])).toEqual([
      [213, "90+", 46_000],
      [82, "61-90", 11_500],
      [46, "31-60", 23_000],
      [10, "0-30", 100_000],
    ]);
    expect(mine.find((r) => r.bucket === "90+")?.creditedMinor).toBe(11_500);
    // Bucket totals include at least our rows (other suites never age into 2031-12).
    expect(aging.buckets["0-30"]).toBeGreaterThanOrEqual(100_000);
    expect(aging.totalMinor).toBe(aging.rows.reduce((s, r) => s + r.outstandingMinor, 0));
  });

  it("uses inclusive bucket edges at 30/60/90 days", () => {
    expect(agingBucketFor(0)).toBe("0-30");
    expect(agingBucketFor(30)).toBe("0-30");
    expect(agingBucketFor(31)).toBe("31-60");
    expect(agingBucketFor(60)).toBe("31-60");
    expect(agingBucketFor(61)).toBe("61-90");
    expect(agingBucketFor(90)).toBe("61-90");
    expect(agingBucketFor(91)).toBe("90+");
  });
});
