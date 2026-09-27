// Lot & expiry tracking. Lots are not a table of their own: a lot is the
// lotNumber/expiresAt recorded on a PURCHASE movement when stock is received.
//
// Which lots still have stock? Consumption and sales don't record a lot, so we
// can't know exactly. Heuristic (FIFO): staff use the oldest stock first, so
// the units on hand today are attributed to the NEWEST receipts. For each
// product we walk its PURCHASE movements newest -> oldest and allocate the
// current on-hand quantity to them; a lot is "plausibly in stock" if it gets
// any of that allocation. Waste/returns that DO name a lot are taken off that
// lot first (so writing off an expired lot clears it from the list). This
// errs on the side of forgetting old lots once enough newer stock has arrived,
// which is exactly the rotation staff are expected to follow.

import { prisma } from "@/lib/db";

export interface ExpiringLot {
  movementId: string;
  productId: string;
  productName: string;
  unit: string;
  lotNumber: string | null;
  expiresAt: Date;
  receivedAt: Date;
  /** Units of this lot plausibly still on the shelf (FIFO estimate). */
  plausibleQty: number;
  expired: boolean;
}

interface PurchaseRow {
  id: string;
  qty: number;
  lotNumber: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/** Pure FIFO allocation of `onHand` across receipts (exported for tests). */
export function allocateOnHandToLots(
  onHand: number,
  purchases: PurchaseRow[],
  lotWriteOffs: Map<string, number> = new Map(),
): Map<string, number> {
  const remainingWriteOff = new Map(lotWriteOffs);
  const allocation = new Map<string, number>();
  let left = Math.max(onHand, 0);
  const newestFirst = [...purchases].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const p of newestFirst) {
    if (left <= 0) break;
    let lotQty = p.qty;
    if (p.lotNumber && remainingWriteOff.get(p.lotNumber)) {
      const take = Math.min(lotQty, remainingWriteOff.get(p.lotNumber)!);
      lotQty -= take;
      remainingWriteOff.set(p.lotNumber, remainingWriteOff.get(p.lotNumber)! - take);
    }
    const here = Math.min(lotQty, left);
    if (here > 0) allocation.set(p.id, here);
    left -= here;
  }
  return allocation;
}

/** Lots expiring within `days` (and already-expired lots still on hand). */
export async function listExpiringLots(days = 60, now = new Date()): Promise<ExpiringLot[]> {
  const horizon = new Date(now.getTime() + days * 86_400_000);
  const candidates = await prisma.stockMovement.findMany({
    where: { type: "PURCHASE", qty: { gt: 0 }, expiresAt: { not: null, lte: horizon }, product: { stockQty: { gt: 0 } } },
    select: { productId: true },
    distinct: ["productId"],
  });
  if (candidates.length === 0) return [];
  const productIds = candidates.map((c) => c.productId);

  const [products, purchases, writeOffs] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, nameEn: true, unit: true, stockQty: true } }),
    prisma.stockMovement.findMany({
      where: { productId: { in: productIds }, type: "PURCHASE", qty: { gt: 0 } },
      select: { id: true, productId: true, qty: true, lotNumber: true, expiresAt: true, createdAt: true },
    }),
    prisma.stockMovement.groupBy({
      by: ["productId", "lotNumber"],
      where: { productId: { in: productIds }, type: { in: ["WASTE", "RETURN"] }, lotNumber: { not: null } },
      _sum: { qty: true },
    }),
  ]);

  const result: ExpiringLot[] = [];
  for (const product of products) {
    const mine = purchases.filter((p) => p.productId === product.id);
    const offs = new Map<string, number>();
    for (const w of writeOffs) {
      if (w.productId === product.id && w.lotNumber) offs.set(w.lotNumber, -(w._sum.qty ?? 0));
    }
    const allocation = allocateOnHandToLots(product.stockQty, mine, offs);
    for (const p of mine) {
      const qty = allocation.get(p.id);
      if (!qty || !p.expiresAt || p.expiresAt > horizon) continue;
      result.push({
        movementId: p.id,
        productId: product.id,
        productName: product.nameEn,
        unit: product.unit,
        lotNumber: p.lotNumber,
        expiresAt: p.expiresAt,
        receivedAt: p.createdAt,
        plausibleQty: qty,
        expired: p.expiresAt <= now,
      });
    }
  }
  return result.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
}
