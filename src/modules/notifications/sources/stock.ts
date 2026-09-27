// "stock" notifications: products at/below their reorder level (or negative)
// and lots expiring within 30 days that plausibly still have stock.

import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { lowStockWhere } from "@/modules/inventory/products";
import { listExpiringLots } from "@/modules/inventory/lots";
import type { NotificationSource } from "./index";

const EXPIRY_ALERT_DAYS = 30;

export const stockSource: NotificationSource = async (permissions) => {
  if (!permissions.has(PERMISSIONS.INVENTORY_MANAGE)) return { count: 0, items: [] };

  const where = { AND: [{ isActive: true }, lowStockWhere()] };
  const [lowCount, low, expiring] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({ where, orderBy: { updatedAt: "desc" }, take: 5 }),
    listExpiringLots(EXPIRY_ALERT_DAYS),
  ]);

  const items = [
    ...low.map((p) => ({
      id: `stock-low-${p.id}`,
      type: "stock" as const,
      title: p.stockQty < 0 ? `Negative stock — ${p.nameEn}` : `Low stock — ${p.nameEn}`,
      subtitle: `${p.stockQty} ${p.unit} on hand (reorder at ${p.reorderLevel})`,
      href: `/admin/inventory/products/${p.id}`,
      at: p.updatedAt,
    })),
    ...expiring.slice(0, 5).map((lot) => ({
      id: `stock-exp-${lot.movementId}`,
      type: "stock" as const,
      title: `${lot.expired ? "Expired" : "Expiring soon"} — ${lot.productName}`,
      subtitle: `${lot.lotNumber ? `Lot ${lot.lotNumber}, ` : ""}${lot.plausibleQty} ${lot.unit}, expires ${lot.expiresAt.toISOString().slice(0, 10)}`,
      href: `/admin/inventory/products/${lot.productId}`,
      at: lot.receivedAt,
    })),
  ];

  return { count: lowCount + expiring.length, items };
};
