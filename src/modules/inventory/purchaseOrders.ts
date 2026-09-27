// Purchase orders: DRAFT -> ORDERED -> PARTIAL/RECEIVED, or CANCELLED.
// Receiving writes PURCHASE stock movements (with lot/expiry) and moves the
// product's cost to a weighted average of what's on hand and what arrived.

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordStockMovement } from "./stock";
import { lowStockWhere } from "./products";
import { reorderQty, weightedAverageCost, type PoStatus } from "./money";

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

/** Riyadh (UTC+3, no DST) calendar year, so a PO raised late on 31 Dec is numbered correctly. */
function centerYear(now: Date): number {
  return new Date(now.getTime() + 3 * 3_600_000).getUTCFullYear();
}

/**
 * Next PO-YYYY-NNNN number. Race-safe: a transaction-scoped advisory lock
 * serializes concurrent callers, so two POs created at the same moment can't
 * read the same MAX. The lock is released when the caller's transaction ends,
 * i.e. after the new PO row is committed. Beyond 9999 the number just widens.
 */
export async function nextPoNumber(tx: Tx, now = new Date()): Promise<string> {
  const year = centerYear(now);
  const prefix = `PO-${year}-`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('lunia:purchase-order-number'))`;
  const start = prefix.length + 1;
  const [row] = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(number FROM ${start}::int) AS INTEGER))::int AS max
    FROM "PurchaseOrder" WHERE number LIKE ${prefix + "%"} AND SUBSTRING(number FROM ${start}::int) ~ '^[0-9]+$'`;
  const next = (row?.max ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Create / edit drafts
// ---------------------------------------------------------------------------

const lineSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().min(1, "Quantity must be at least 1").max(1_000_000),
  unitCostMinor: z.number().int().min(0).max(100_000_000),
});

export const poInputSchema = z.object({
  supplierId: z.string().min(1, "Choose a supplier"),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  lines: z.array(lineSchema).min(1, "Add at least one product").max(200),
});
export type PoInput = z.input<typeof poInputSchema>;

function totalOf(lines: { qty: number; unitCostMinor: number }[]): number {
  return lines.reduce((sum, l) => sum + l.qty * l.unitCostMinor, 0);
}

function assertUniqueProducts(lines: { productId: string }[]) {
  const ids = lines.map((l) => l.productId);
  if (new Set(ids).size !== ids.length) throw new Error("Each product can appear only once per purchase order.");
}

export async function createPurchaseOrder(input: PoInput, actorId?: string, now = new Date()) {
  const data = poInputSchema.parse(input);
  assertUniqueProducts(data.lines);
  return prisma.$transaction(async (tx) => {
    const number = await nextPoNumber(tx, now);
    return tx.purchaseOrder.create({
      data: {
        number,
        supplierId: data.supplierId,
        notes: data.notes,
        createdById: actorId,
        totalMinor: totalOf(data.lines),
        lines: { create: data.lines },
      },
    });
  });
}

async function lockPo(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<{ id: string; status: PoStatus }[]>`
    SELECT id, status FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
  if (rows.length === 0) throw new Error("Purchase order not found");
  return rows[0];
}

export async function updateDraftPurchaseOrder(id: string, input: PoInput) {
  const data = poInputSchema.parse(input);
  assertUniqueProducts(data.lines);
  return prisma.$transaction(async (tx) => {
    const po = await lockPo(tx, id);
    if (po.status !== "DRAFT") throw new Error("Only draft purchase orders can be edited.");
    await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
    return tx.purchaseOrder.update({
      where: { id },
      data: { supplierId: data.supplierId, notes: data.notes, totalMinor: totalOf(data.lines), lines: { create: data.lines } },
    });
  });
}

export async function markOrdered(id: string) {
  return prisma.$transaction(async (tx) => {
    const po = await lockPo(tx, id);
    if (po.status !== "DRAFT") throw new Error("Only a draft can be marked as ordered.");
    return tx.purchaseOrder.update({ where: { id }, data: { status: "ORDERED", orderedAt: new Date() } });
  });
}

/** Cancelling a PARTIAL order closes it: what already arrived stays in stock. */
export async function cancelPurchaseOrder(id: string) {
  return prisma.$transaction(async (tx) => {
    const po = await lockPo(tx, id);
    if (!["DRAFT", "ORDERED", "PARTIAL"].includes(po.status)) throw new Error(`A ${po.status.toLowerCase()} order can't be cancelled.`);
    return tx.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED" } });
  });
}

// ---------------------------------------------------------------------------
// Receiving
// ---------------------------------------------------------------------------

export const receiveSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.string().min(1),
        qty: z.number().int().min(0).max(1_000_000),
        lotNumber: z.string().trim().max(64).optional(),
        expiresAt: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.date().optional()),
      }),
    )
    .min(1),
});
export type ReceiveInput = z.input<typeof receiveSchema>;

export async function receivePurchaseOrder(id: string, input: ReceiveInput, actorId?: string) {
  const data = receiveSchema.parse(input);
  const toReceive = data.lines.filter((l) => l.qty > 0);
  if (toReceive.length === 0) throw new Error("Enter a received quantity for at least one line.");

  return prisma.$transaction(async (tx) => {
    const po = await lockPo(tx, id);
    if (po.status !== "ORDERED" && po.status !== "PARTIAL") {
      throw new Error("Only ordered (or partially received) purchase orders can be received.");
    }
    const lines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } });
    const byId = new Map(lines.map((l) => [l.id, l]));

    for (const r of toReceive) {
      const line = byId.get(r.lineId);
      if (!line) throw new Error("A received line doesn't belong to this purchase order.");
      const outstanding = line.qty - line.receivedQty;
      if (r.qty > outstanding) throw new Error(`Can't receive ${r.qty}; only ${outstanding} outstanding on a line.`);

      // Lock the product so the weighted average uses a stable on-hand qty.
      const [product] = await tx.$queryRaw<{ stockQty: number; costMinor: number }[]>`
        SELECT "stockQty", "costMinor" FROM "Product" WHERE id = ${line.productId} FOR UPDATE`;
      const newCost = weightedAverageCost(product.stockQty, product.costMinor, r.qty, line.unitCostMinor);
      if (newCost !== product.costMinor) {
        await tx.product.update({ where: { id: line.productId }, data: { costMinor: newCost } });
      }
      await recordStockMovement(
        {
          productId: line.productId,
          qty: r.qty,
          type: "PURCHASE",
          refType: "PURCHASE_ORDER",
          refId: id,
          unitCostMinor: line.unitCostMinor,
          lotNumber: r.lotNumber || undefined,
          expiresAt: r.expiresAt,
          createdById: actorId,
        },
        tx,
      );
      line.receivedQty += r.qty;
      await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQty: line.receivedQty } });
    }

    const complete = lines.every((l) => l.receivedQty >= l.qty);
    return tx.purchaseOrder.update({
      where: { id },
      data: complete ? { status: "RECEIVED", receivedAt: new Date() } : { status: "PARTIAL" },
    });
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function listPurchaseOrders(opts: { status?: string } = {}) {
  return prisma.purchaseOrder.findMany({
    where: opts.status ? { status: opts.status } : {},
    include: { supplier: { select: { id: true, name: true } }, _count: { select: { lines: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

export function getPurchaseOrder(id: string) {
  return prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      lines: {
        include: { product: { select: { id: true, nameEn: true, nameAr: true, sku: true, barcode: true, unit: true, brandName: true } } },
        orderBy: { product: { nameEn: "asc" } },
      },
    },
  });
}

export function getReceiptsForPo(id: string) {
  return prisma.stockMovement.findMany({
    where: { refType: "PURCHASE_ORDER", refId: id, type: "PURCHASE" },
    include: { product: { select: { nameEn: true, unit: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export interface ReorderSuggestion {
  productId: string;
  nameEn: string;
  unit: string;
  stockQty: number;
  reorderLevel: number;
  qty: number;
  unitCostMinor: number;
}

/**
 * Active products at/below their reorder level (optionally only those linked
 * to one supplier), with the qty that tops them up to 2x the reorder level.
 * Products without a reorder level aren't suggested even if negative -- we
 * wouldn't know how much to buy.
 */
export async function suggestReorder(opts: { supplierId?: string } = {}): Promise<ReorderSuggestion[]> {
  const products = await prisma.product.findMany({
    where: {
      AND: [
        { isActive: true, reorderLevel: { gt: 0 } },
        lowStockWhere(),
        ...(opts.supplierId ? [{ supplierId: opts.supplierId }] : []),
      ],
    },
    orderBy: { nameEn: "asc" },
    select: { id: true, nameEn: true, unit: true, stockQty: true, reorderLevel: true, costMinor: true },
  });
  return products
    .map((p) => ({
      productId: p.id,
      nameEn: p.nameEn,
      unit: p.unit,
      stockQty: p.stockQty,
      reorderLevel: p.reorderLevel,
      qty: reorderQty(p.stockQty, p.reorderLevel),
      unitCostMinor: p.costMinor,
    }))
    .filter((s) => s.qty > 0);
}
