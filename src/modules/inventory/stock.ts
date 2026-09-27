// The single write path for stock levels. Every change to Product.stockQty
// goes through recordStockMovement so the StockMovement ledger and the
// denormalized balance can never drift apart. Pass a transaction client when
// the movement is part of a bigger unit of work (issuing an invoice,
// completing an appointment, receiving a purchase order).

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

type Tx = Prisma.TransactionClient | PrismaClient;

export type StockMovementType = "PURCHASE" | "SALE" | "CONSUMPTION" | "ADJUSTMENT" | "RETURN" | "WASTE";

export interface StockMovementInput {
  productId: string;
  /** Positive = into stock, negative = out of stock. Must be non-zero. */
  qty: number;
  type: StockMovementType;
  refType?: "INVOICE" | "APPOINTMENT" | "PURCHASE_ORDER" | "MANUAL";
  refId?: string;
  unitCostMinor?: number;
  lotNumber?: string;
  expiresAt?: Date;
  note?: string;
  createdById?: string;
}

export async function recordStockMovement(input: StockMovementInput, tx: Tx = prisma) {
  if (!Number.isInteger(input.qty) || input.qty === 0) throw new Error("Stock movement qty must be a non-zero integer");
  const movement = await tx.stockMovement.create({ data: input });
  await tx.product.update({ where: { id: input.productId }, data: { stockQty: { increment: input.qty } } });
  return movement;
}
