import { prisma } from "@/lib/db";
import { lowStockWhere } from "./products";
import { listExpiringLots } from "./lots";

/** Value of on-hand stock at (weighted average) cost; negative stock counts as zero. */
export async function stockValueMinor(): Promise<number> {
  const [row] = await prisma.$queryRaw<{ total: bigint | null }[]>`
    SELECT SUM(GREATEST("stockQty", 0)::bigint * "costMinor") AS total FROM "Product" WHERE "isActive" = true`;
  return Number(row?.total ?? 0);
}

export function countLowStock(): Promise<number> {
  return prisma.product.count({ where: { AND: [{ isActive: true }, lowStockWhere()] } });
}

export async function topConsumed(days = 30, take = 8) {
  const since = new Date(Date.now() - days * 86_400_000);
  const grouped = await prisma.stockMovement.groupBy({
    by: ["productId"],
    where: { type: "CONSUMPTION", createdAt: { gte: since } },
    _sum: { qty: true },
    orderBy: { _sum: { qty: "asc" } },
    take,
  });
  const products = await prisma.product.findMany({
    where: { id: { in: grouped.map((g) => g.productId) } },
    select: { id: true, nameEn: true, unit: true, costMinor: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return grouped
    .map((g) => {
      const p = byId.get(g.productId);
      const qty = -(g._sum.qty ?? 0);
      return p ? { productId: p.id, nameEn: p.nameEn, unit: p.unit, qty, valueMinor: qty * p.costMinor } : null;
    })
    .filter((r): r is NonNullable<typeof r> => !!r && r.qty > 0);
}

export function recentMovements(take = 12) {
  return prisma.stockMovement.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { product: { select: { id: true, nameEn: true, unit: true } } },
  });
}

export async function getInventoryDashboard() {
  const [valueMinor, lowStock, expiring, top, recent] = await Promise.all([
    stockValueMinor(),
    countLowStock(),
    listExpiringLots(60),
    topConsumed(30),
    recentMovements(12),
  ]);
  return { valueMinor, lowStock, expiring, top, recent };
}
