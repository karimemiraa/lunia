import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { weightedAverageCost, reorderQty } from "@/modules/inventory/money";
import {
  createPurchaseOrder,
  markOrdered,
  receivePurchaseOrder,
  cancelPurchaseOrder,
  suggestReorder,
  updateDraftPurchaseOrder,
} from "@/modules/inventory/purchaseOrders";
import { makeProduct, makeSupplier, sweepInventoryTestData } from "./helpers";

beforeAll(sweepInventoryTestData);
afterAll(sweepInventoryTestData);

describe("weightedAverageCost", () => {
  it("blends on-hand value with the receipt", () => {
    // 10 @ 10.00 + 30 @ 14.00 = 520.00 / 40 = 13.00
    expect(weightedAverageCost(10, 1000, 30, 1400)).toBe(1300);
  });
  it("uses the receipt cost when nothing (or less than nothing) is on hand", () => {
    expect(weightedAverageCost(0, 999, 5, 1234)).toBe(1234);
    expect(weightedAverageCost(-4, 999, 5, 1234)).toBe(1234);
  });
  it("rounds to the nearest halala", () => {
    // (1*100 + 2*101) / 3 = 100.67
    expect(weightedAverageCost(1, 100, 2, 101)).toBe(101);
  });
});

describe("reorder suggestion", () => {
  it("tops up to twice the reorder level", () => {
    expect(reorderQty(3, 10)).toBe(17);
    expect(reorderQty(-2, 5)).toBe(12);
    expect(reorderQty(25, 10)).toBe(0);
  });

  it("suggests only active products at/below their reorder level for the supplier", async () => {
    const supplier = await makeSupplier();
    const low = await makeProduct({ supplierId: supplier.id, stockQty: 4, reorderLevel: 5, costMinor: 250 });
    const atLevel = await makeProduct({ supplierId: supplier.id, stockQty: 5, reorderLevel: 5 });
    await makeProduct({ supplierId: supplier.id, stockQty: 6, reorderLevel: 5 });
    await makeProduct({ supplierId: supplier.id, stockQty: 0, reorderLevel: 0 });
    const inactive = await makeProduct({ supplierId: supplier.id, stockQty: 1, reorderLevel: 5 });
    await prisma.product.update({ where: { id: inactive.id }, data: { isActive: false } });

    const suggestions = await suggestReorder({ supplierId: supplier.id });
    expect(suggestions.map((s) => s.productId).sort()).toEqual([low.id, atLevel.id].sort());
    const lowSuggestion = suggestions.find((s) => s.productId === low.id)!;
    expect(lowSuggestion.qty).toBe(6);
    expect(lowSuggestion.unitCostMinor).toBe(250);
  });
});

describe("purchase orders", () => {
  it("numbers POs PO-YYYY-NNNN sequentially, race-safe under concurrency", async () => {
    const supplier = await makeSupplier();
    const product = await makeProduct();
    // A far-future year keeps this isolated from real POs.
    const now = new Date("2098-06-01T10:00:00Z");
    const pos = await Promise.all(
      Array.from({ length: 6 }, () =>
        createPurchaseOrder({ supplierId: supplier.id, lines: [{ productId: product.id, qty: 1, unitCostMinor: 100 }] }, undefined, now),
      ),
    );
    const numbers = pos.map((p) => p.number).sort();
    expect(new Set(numbers).size).toBe(6);
    const seqs = numbers.map((n) => Number(n.split("-")[2]));
    expect(numbers.every((n) => /^PO-2098-\d{4}$/.test(n))).toBe(true);
    expect(seqs[5] - seqs[0]).toBe(5);

    // Late on 31 Dec UTC is already the new year in Riyadh.
    const nye = await createPurchaseOrder(
      { supplierId: supplier.id, lines: [{ productId: product.id, qty: 1, unitCostMinor: 100 }] },
      undefined,
      new Date("2098-12-31T22:30:00Z"),
    );
    expect(nye.number).toMatch(/^PO-2099-\d{4}$/);
  });

  it("receives partially then fully, with lots, movements and weighted average cost", async () => {
    const supplier = await makeSupplier();
    const product = await makeProduct({ stockQty: 10, costMinor: 1000 });
    const po = await createPurchaseOrder({
      supplierId: supplier.id,
      lines: [{ productId: product.id, qty: 30, unitCostMinor: 1400 }],
    });
    expect(po.status).toBe("DRAFT");
    expect(po.totalMinor).toBe(30 * 1400);

    // Drafts can't be received.
    const [line] = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } });
    await expect(receivePurchaseOrder(po.id, { lines: [{ lineId: line.id, qty: 1 }] })).rejects.toThrow();

    await markOrdered(po.id);

    const expiresAt = new Date("2027-01-31T00:00:00Z");
    const partial = await receivePurchaseOrder(po.id, { lines: [{ lineId: line.id, qty: 10, lotNumber: "L-1", expiresAt }] });
    expect(partial.status).toBe("PARTIAL");
    let p = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(p.stockQty).toBe(20);
    // 10 @ 10.00 + 10 @ 14.00 -> 12.00
    expect(p.costMinor).toBe(1200);

    // Can't receive more than is outstanding.
    await expect(receivePurchaseOrder(po.id, { lines: [{ lineId: line.id, qty: 21 }] })).rejects.toThrow(/outstanding/);

    const done = await receivePurchaseOrder(po.id, { lines: [{ lineId: line.id, qty: 20, lotNumber: "L-2" }] });
    expect(done.status).toBe("RECEIVED");
    expect(done.receivedAt).not.toBeNull();
    p = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(p.stockQty).toBe(40);
    // 20 @ 12.00 + 20 @ 14.00 -> 13.00
    expect(p.costMinor).toBe(1300);

    const movements = await prisma.stockMovement.findMany({
      where: { refType: "PURCHASE_ORDER", refId: po.id },
      orderBy: { createdAt: "asc" },
    });
    expect(movements.map((m) => [m.type, m.qty, m.unitCostMinor, m.lotNumber])).toEqual([
      ["PURCHASE", 10, 1400, "L-1"],
      ["PURCHASE", 20, 1400, "L-2"],
    ]);
    expect(movements[0].expiresAt?.toISOString()).toBe(expiresAt.toISOString());

    // A fully received PO can't be received again or cancelled.
    await expect(receivePurchaseOrder(po.id, { lines: [{ lineId: line.id, qty: 1 }] })).rejects.toThrow();
    await expect(cancelPurchaseOrder(po.id)).rejects.toThrow();
  });

  it("keeps PARTIAL across multiple lines until every line is complete", async () => {
    const supplier = await makeSupplier();
    const a = await makeProduct();
    const b = await makeProduct();
    const po = await createPurchaseOrder({
      supplierId: supplier.id,
      lines: [
        { productId: a.id, qty: 5, unitCostMinor: 100 },
        { productId: b.id, qty: 2, unitCostMinor: 300 },
      ],
    });
    await markOrdered(po.id);
    const lines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } });
    const lineA = lines.find((l) => l.productId === a.id)!;
    const lineB = lines.find((l) => l.productId === b.id)!;

    const r1 = await receivePurchaseOrder(po.id, { lines: [{ lineId: lineA.id, qty: 5 }, { lineId: lineB.id, qty: 0 }] });
    expect(r1.status).toBe("PARTIAL");
    const r2 = await receivePurchaseOrder(po.id, { lines: [{ lineId: lineB.id, qty: 2 }] });
    expect(r2.status).toBe("RECEIVED");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: a.id } })).costMinor).toBe(100);
  });

  it("only edits drafts and rejects duplicate products", async () => {
    const supplier = await makeSupplier();
    const a = await makeProduct();
    const po = await createPurchaseOrder({ supplierId: supplier.id, lines: [{ productId: a.id, qty: 1, unitCostMinor: 100 }] });
    await expect(
      updateDraftPurchaseOrder(po.id, {
        supplierId: supplier.id,
        lines: [
          { productId: a.id, qty: 1, unitCostMinor: 100 },
          { productId: a.id, qty: 2, unitCostMinor: 100 },
        ],
      }),
    ).rejects.toThrow(/once/);
    const updated = await updateDraftPurchaseOrder(po.id, { supplierId: supplier.id, lines: [{ productId: a.id, qty: 4, unitCostMinor: 250 }] });
    expect(updated.totalMinor).toBe(1000);
    await markOrdered(po.id);
    await expect(updateDraftPurchaseOrder(po.id, { supplierId: supplier.id, lines: [{ productId: a.id, qty: 1, unitCostMinor: 1 }] })).rejects.toThrow(/draft/);
    const cancelled = await cancelPurchaseOrder(po.id);
    expect(cancelled.status).toBe("CANCELLED");
  });
});
