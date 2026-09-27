// Stock ledger reads plus the manual ways staff change stock: one-off
// adjustments (count correction, waste/expired, return to supplier) and a
// multi-product stock-take. All writes go through recordStockMovement.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { recordStockMovement } from "./stock";

export interface LedgerRow {
  id: string;
  createdAt: Date;
  type: string;
  qty: number;
  /** On-hand balance right after this movement. */
  balance: number;
  refType: string | null;
  refId: string | null;
  unitCostMinor: number | null;
  lotNumber: string | null;
  expiresAt: Date | null;
  note: string | null;
  createdById: string | null;
}

/**
 * Newest-first movements with a running balance. The balance is walked
 * backwards from the denormalized Product.stockQty, so it stays correct even
 * when only the most recent `limit` movements are loaded.
 */
export async function getProductLedger(productId: string, limit = 200): Promise<LedgerRow[]> {
  const [product, movements] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { stockQty: true } }),
    prisma.stockMovement.findMany({
      where: { productId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    }),
  ]);
  if (!product) return [];
  let balance = product.stockQty;
  return movements.map((m) => {
    const row: LedgerRow = { ...m, balance };
    balance -= m.qty;
    return row;
  });
}

export const ADJUSTMENT_KINDS = ["COUNT", "WASTE", "RETURN"] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

export const adjustmentSchema = z.discriminatedUnion("kind", [
  // Count correction: staff enter what is physically on the shelf.
  z.object({
    kind: z.literal("COUNT"),
    productId: z.string().min(1),
    countedQty: z.number().int().min(-1_000_000).max(1_000_000),
    reason: z.string().trim().min(3, "A reason is required").max(500),
  }),
  // Waste/expired or return to supplier: staff enter how many units left.
  z.object({
    kind: z.enum(["WASTE", "RETURN"]),
    productId: z.string().min(1),
    qty: z.number().int().min(1).max(1_000_000),
    lotNumber: z.string().trim().max(64).optional(),
    reason: z.string().trim().min(3, "A reason is required").max(500),
  }),
]);
export type AdjustmentInput = z.input<typeof adjustmentSchema>;

/** Returns the recorded movement, or null when a count matched the system. */
export async function adjustStock(input: AdjustmentInput, actorId?: string) {
  const data = adjustmentSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    // Lock the product row so a count correction computes its delta against
    // a balance nobody else is changing concurrently.
    const rows = await tx.$queryRaw<{ stockQty: number }[]>`
      SELECT "stockQty" FROM "Product" WHERE id = ${data.productId} FOR UPDATE`;
    if (rows.length === 0) throw new Error("Product not found");
    const current = rows[0].stockQty;

    if (data.kind === "COUNT") {
      const delta = data.countedQty - current;
      if (delta === 0) return null;
      return recordStockMovement(
        {
          productId: data.productId,
          qty: delta,
          type: "ADJUSTMENT",
          refType: "MANUAL",
          note: `Count correction (${current} -> ${data.countedQty}): ${data.reason}`,
          createdById: actorId,
        },
        tx,
      );
    }
    return recordStockMovement(
      {
        productId: data.productId,
        qty: -data.qty,
        type: data.kind,
        refType: "MANUAL",
        lotNumber: data.lotNumber || undefined,
        note: data.reason,
        createdById: actorId,
      },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Stock-take
// ---------------------------------------------------------------------------

export const stockTakeSchema = z.object({
  counts: z
    .array(z.object({ productId: z.string().min(1), countedQty: z.number().int().min(0).max(1_000_000) }))
    .min(1, "Enter at least one counted quantity")
    .max(2000),
  note: z.string().trim().max(500).optional(),
});
export type StockTakeInput = z.input<typeof stockTakeSchema>;

export interface StockTakeVariance {
  productId: string;
  nameEn: string;
  unit: string;
  systemQty: number;
  countedQty: number;
  variance: number;
  costMinor: number;
  /** Value of the variance at current cost (negative = shrinkage). */
  varianceValueMinor: number;
}

function toVariance(
  p: { id: string; nameEn: string; unit: string; stockQty: number; costMinor: number },
  countedQty: number,
): StockTakeVariance {
  const variance = countedQty - p.stockQty;
  return {
    productId: p.id,
    nameEn: p.nameEn,
    unit: p.unit,
    systemQty: p.stockQty,
    countedQty,
    variance,
    costMinor: p.costMinor,
    varianceValueMinor: variance * p.costMinor,
  };
}

// Duplicate product rows in one count sheet: the last entry wins.
function dedupeCounts(counts: { productId: string; countedQty: number }[]) {
  return new Map(counts.map((c) => [c.productId, c.countedQty]));
}

export async function previewStockTake(input: StockTakeInput): Promise<StockTakeVariance[]> {
  const { counts } = stockTakeSchema.parse(input);
  const byId = dedupeCounts(counts);
  const products = await prisma.product.findMany({
    where: { id: { in: [...byId.keys()] } },
    select: { id: true, nameEn: true, unit: true, stockQty: true, costMinor: true },
    orderBy: { nameEn: "asc" },
  });
  return products.map((p) => toVariance(p, byId.get(p.id)!));
}

/**
 * Posts every non-zero variance as an ADJUSTMENT movement in ONE transaction.
 * Variances are recomputed against row-locked balances, so a sale or
 * consumption that landed between preview and post is respected (the count
 * is the truth; the adjustment is whatever closes the gap right now).
 */
export async function postStockTake(input: StockTakeInput, actorId?: string) {
  const { counts, note } = stockTakeSchema.parse(input);
  const byId = dedupeCounts(counts);
  const ids = [...byId.keys()].sort();

  return prisma.$transaction(async (tx) => {
    // Lock in a stable order to avoid deadlocks with other multi-row writers.
    const locked = await tx.$queryRaw<{ id: string; nameEn: string; unit: string; stockQty: number; costMinor: number }[]>`
      SELECT id, "nameEn", unit, "stockQty", "costMinor" FROM "Product"
      WHERE id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;
    const variances = locked.map((p) => toVariance(p, byId.get(p.id)!));
    const stamp = new Date().toISOString().slice(0, 10);
    for (const v of variances) {
      if (v.variance === 0) continue;
      await recordStockMovement(
        {
          productId: v.productId,
          qty: v.variance,
          type: "ADJUSTMENT",
          refType: "MANUAL",
          note: `Stock-take ${stamp} (${v.systemQty} -> ${v.countedQty})${note ? `: ${note}` : ""}`,
          createdById: actorId,
        },
        tx,
      );
    }
    return {
      counted: variances.length,
      adjusted: variances.filter((v) => v.variance !== 0).length,
      netValueMinor: variances.reduce((sum, v) => sum + v.varianceValueMinor, 0),
      variances,
    };
  });
}
