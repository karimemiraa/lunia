import { prisma } from "@/lib/db";

// Every row these suites create is tagged with this prefix (product SKUs,
// supplier names, phones, service slugs) so cleanup can sweep leftovers from a
// crashed previous run as well as this run's own rows.
export const PREFIX = "TESTINV";
let counter = 0;

export function uid(label = "x"): string {
  counter += 1;
  return `${PREFIX}-${label}-${Date.now().toString(36)}-${counter}`;
}

export async function makeSupplier(name = uid("sup")) {
  return prisma.supplier.create({ data: { name } });
}

export async function makeProduct(data: { stockQty?: number; costMinor?: number; reorderLevel?: number; supplierId?: string; kind?: string } = {}) {
  const product = await prisma.product.create({
    data: {
      sku: uid("sku"),
      nameEn: uid("Product"),
      unit: "pcs",
      kind: data.kind ?? "BOTH",
      costMinor: data.costMinor ?? 0,
      reorderLevel: data.reorderLevel ?? 0,
      supplierId: data.supplierId,
    },
  });
  if (data.stockQty) {
    await prisma.stockMovement.create({ data: { productId: product.id, qty: data.stockQty, type: "ADJUSTMENT", note: "test opening" } });
    return prisma.product.update({ where: { id: product.id }, data: { stockQty: data.stockQty } });
  }
  return product;
}

export async function sweepInventoryTestData() {
  const suppliers = await prisma.supplier.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } });
  const supplierIds = suppliers.map((s) => s.id);
  // POs restrict deletion of suppliers and products, so they go first.
  await prisma.purchaseOrder.deleteMany({
    where: { OR: [{ supplierId: { in: supplierIds } }, { lines: { some: { product: { sku: { startsWith: PREFIX } } } } }] },
  });
  await prisma.product.deleteMany({ where: { sku: { startsWith: PREFIX } } });
  await prisma.supplier.deleteMany({ where: { id: { in: supplierIds } } });

  const users = await prisma.user.findMany({ where: { phone: { startsWith: `+966${PREFIX}` } }, include: { clientProfile: true } });
  const profileIds = users.map((u) => u.clientProfile?.id).filter((id): id is string => !!id);
  if (profileIds.length) {
    const bookings = await prisma.booking.findMany({ where: { clientProfileId: { in: profileIds } }, select: { id: true } });
    await prisma.scheduledMessage.deleteMany({ where: { bookingId: { in: bookings.map((b) => b.id) } } });
    // Appointments name the test user as staff too, so bookings go before users.
    await prisma.booking.deleteMany({ where: { id: { in: bookings.map((b) => b.id) } } });
  }
  await prisma.user.deleteMany({ where: { phone: { startsWith: `+966${PREFIX}` } } });
  await prisma.service.deleteMany({ where: { slug: { startsWith: PREFIX.toLowerCase() } } });
}
