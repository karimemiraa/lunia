import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { recordStockMovement } from "@/modules/inventory/stock";
import { adjustStock, getProductLedger, postStockTake, previewStockTake } from "@/modules/inventory/ledger";
import { allocateOnHandToLots, listExpiringLots } from "@/modules/inventory/lots";
import { createProduct, findProductByCode, listProducts } from "@/modules/inventory/products";
import { makeProduct, sweepInventoryTestData, uid } from "./helpers";

beforeAll(sweepInventoryTestData);
afterAll(sweepInventoryTestData);

describe("products", () => {
  it("creates with opening stock and finds by barcode or SKU", async () => {
    const sku = uid("sku");
    const barcode = uid("bc");
    const product = await createProduct({
      sku,
      barcode,
      nameEn: uid("Serum"),
      unit: "ml",
      kind: "CONSUMABLE",
      costMinor: 500,
      priceMinor: 0,
      vatRateBp: 1500,
      reorderLevel: 3,
      isActive: true,
      openingQty: 12,
    });
    expect(product!.stockQty).toBe(0); // returned before the movement landed
    const fresh = await prisma.product.findUniqueOrThrow({ where: { id: product!.id } });
    expect(fresh.stockQty).toBe(12);
    expect((await findProductByCode(barcode))?.id).toBe(product!.id);
    expect((await findProductByCode(` ${sku} `))?.id).toBe(product!.id);
    await expect(
      createProduct({ sku: uid("sku"), barcode, nameEn: "dup", unit: "pcs", kind: "RETAIL", costMinor: 0, priceMinor: 0, vatRateBp: 1500, reorderLevel: 0, isActive: true }),
    ).rejects.toThrow(/barcode/);
  });

  it("filters low stock (at/below reorder level, or negative)", async () => {
    const low = await makeProduct({ stockQty: 2, reorderLevel: 2 });
    const ok = await makeProduct({ stockQty: 9, reorderLevel: 2 });
    const negative = await makeProduct({ reorderLevel: 0 });
    await recordStockMovement({ productId: negative.id, qty: -1, type: "CONSUMPTION" });
    const ids = (await listProducts({ lowStock: true, q: "TESTINV" })).map((p) => p.id);
    expect(ids).toContain(low.id);
    expect(ids).toContain(negative.id);
    expect(ids).not.toContain(ok.id);
  });
});

describe("ledger and adjustments", () => {
  it("shows a running balance and requires a reason", async () => {
    const product = await makeProduct({ stockQty: 10 });
    await adjustStock({ kind: "WASTE", productId: product.id, qty: 3, reason: "Expired batch" });
    await adjustStock({ kind: "RETURN", productId: product.id, qty: 1, reason: "Damaged on arrival" });
    const count = await adjustStock({ kind: "COUNT", productId: product.id, countedQty: 8, reason: "Shelf count" });
    expect(count?.qty).toBe(2);
    expect(await adjustStock({ kind: "COUNT", productId: product.id, countedQty: 8, reason: "Shelf count" })).toBeNull();
    await expect(adjustStock({ kind: "WASTE", productId: product.id, qty: 1, reason: "" })).rejects.toThrow();

    const ledger = await getProductLedger(product.id);
    expect(ledger.map((r) => [r.type, r.qty, r.balance])).toEqual([
      ["ADJUSTMENT", 2, 8],
      ["RETURN", -1, 6],
      ["WASTE", -3, 7],
      ["ADJUSTMENT", 10, 10],
    ]);
  });
});

describe("stock-take", () => {
  it("previews variances and posts them as ADJUSTMENT movements in one go", async () => {
    const a = await makeProduct({ stockQty: 10, costMinor: 200 });
    const b = await makeProduct({ stockQty: 5, costMinor: 1000 });
    const c = await makeProduct({ stockQty: 7 });

    const preview = await previewStockTake({
      counts: [
        { productId: a.id, countedQty: 8 },
        { productId: b.id, countedQty: 6 },
        { productId: c.id, countedQty: 7 },
      ],
    });
    const byId = new Map(preview.map((v) => [v.productId, v]));
    expect(byId.get(a.id)).toMatchObject({ systemQty: 10, countedQty: 8, variance: -2, varianceValueMinor: -400 });
    expect(byId.get(b.id)).toMatchObject({ variance: 1, varianceValueMinor: 1000 });
    expect(byId.get(c.id)?.variance).toBe(0);

    // A consumption between preview and post: the count is still the truth.
    await recordStockMovement({ productId: a.id, qty: -1, type: "CONSUMPTION" });

    const result = await postStockTake({
      counts: [
        { productId: a.id, countedQty: 8 },
        { productId: b.id, countedQty: 6 },
        { productId: c.id, countedQty: 7 },
      ],
      note: "Quarterly count",
    });
    expect(result.adjusted).toBe(2);
    const after = await prisma.product.findMany({ where: { id: { in: [a.id, b.id, c.id] } } });
    expect(Object.fromEntries(after.map((p) => [p.id, p.stockQty]))).toEqual({ [a.id]: 8, [b.id]: 6, [c.id]: 7 });
    const adjA = await prisma.stockMovement.findFirstOrThrow({ where: { productId: a.id, type: "ADJUSTMENT", note: { startsWith: "Stock-take" } } });
    expect(adjA.qty).toBe(-1);
    expect(adjA.note).toContain("Quarterly count");
    expect(await prisma.stockMovement.count({ where: { productId: c.id, note: { startsWith: "Stock-take" } } })).toBe(0);
  });
});

describe("lots and expiry", () => {
  it("attributes on-hand stock to the newest receipts (FIFO)", () => {
    const d = (n: number) => new Date(2026, 0, n);
    const purchases = [
      { id: "old", qty: 10, lotNumber: "A", expiresAt: d(10), createdAt: d(1) },
      { id: "mid", qty: 5, lotNumber: "B", expiresAt: d(20), createdAt: d(2) },
      { id: "new", qty: 4, lotNumber: "C", expiresAt: d(30), createdAt: d(3) },
    ];
    expect(Object.fromEntries(allocateOnHandToLots(7, purchases))).toEqual({ new: 4, mid: 3 });
    expect(Object.fromEntries(allocateOnHandToLots(0, purchases))).toEqual({});
    // Writing off lot C sends the remaining stock back to older lots.
    expect(Object.fromEntries(allocateOnHandToLots(7, purchases, new Map([["C", 4]])))).toEqual({ mid: 5, old: 2 });
  });

  it("lists lots expiring soon that plausibly still have stock", async () => {
    const product = await makeProduct();
    const soon = new Date(Date.now() + 20 * 86_400_000);
    const later = new Date(Date.now() + 200 * 86_400_000);
    await recordStockMovement({ productId: product.id, qty: 5, type: "PURCHASE", lotNumber: "SOON", expiresAt: soon });
    await recordStockMovement({ productId: product.id, qty: 5, type: "PURCHASE", lotNumber: "LATER", expiresAt: later });

    let lots = (await listExpiringLots(60)).filter((l) => l.productId === product.id);
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ lotNumber: "SOON", plausibleQty: 5, expired: false });

    // Using 7 of 10 leaves 3, which FIFO attributes to the newer LATER lot.
    await recordStockMovement({ productId: product.id, qty: -7, type: "CONSUMPTION" });
    lots = (await listExpiringLots(60)).filter((l) => l.productId === product.id);
    expect(lots).toHaveLength(0);
  });
});

describe("dashboard and stock notifications", () => {
  it("reports value, low stock and expiring lots; notifications respect the permission", async () => {
    const { getInventoryDashboard } = await import("@/modules/inventory/dashboard");
    const { stockSource } = await import("@/modules/notifications/sources/stock");
    const low = await makeProduct({ stockQty: 1, reorderLevel: 3, costMinor: 1000 });
    await recordStockMovement({ productId: low.id, qty: 2, type: "PURCHASE", lotNumber: "NOTIFY", expiresAt: new Date(Date.now() + 10 * 86_400_000) });

    const dash = await getInventoryDashboard();
    expect(dash.valueMinor).toBeGreaterThanOrEqual(3 * 1000);
    expect(dash.lowStock).toBeGreaterThanOrEqual(1);
    expect(dash.expiring.some((l) => l.productId === low.id)).toBe(true);

    expect(await stockSource(new Set())).toEqual({ count: 0, items: [] });
    const feed = await stockSource(new Set(["inventory:manage"]));
    expect(feed.count).toBeGreaterThanOrEqual(2);
    expect(feed.items.every((i) => i.type === "stock")).toBe(true);
  });
});
