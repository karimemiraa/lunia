import { z } from "zod";
import { prisma } from "@/lib/db";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const supplierInputSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required").max(200),
  contactName: optionalText(120),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => !v || z.email().safeParse(v).success, "Enter a valid email"),
  // Saudi VAT registration numbers are 15 digits; allow others for foreign suppliers.
  vatNumber: optionalText(40),
  notes: optionalText(2000),
  isActive: z.boolean().default(true),
});
export type SupplierInput = z.input<typeof supplierInputSchema>;

export function createSupplier(input: SupplierInput) {
  return prisma.supplier.create({ data: supplierInputSchema.parse(input) });
}

export function updateSupplier(id: string, input: SupplierInput) {
  return prisma.supplier.update({ where: { id }, data: supplierInputSchema.parse(input) });
}

/** Hard delete only when nothing references it; otherwise deactivate instead. */
export async function deleteSupplier(id: string) {
  const poCount = await prisma.purchaseOrder.count({ where: { supplierId: id } });
  if (poCount > 0) throw new Error("This supplier has purchase orders. Deactivate it instead.");
  await prisma.supplier.delete({ where: { id } });
}

export async function listSuppliers(opts: { includeInactive?: boolean } = {}) {
  return prisma.supplier.findMany({
    where: opts.includeInactive ? {} : { isActive: true },
    include: { _count: { select: { products: true, purchaseOrders: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

export function listSupplierOptions() {
  return prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function getSupplierDetail(id: string) {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      products: { orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true, sku: true, unit: true, stockQty: true, costMinor: true, isActive: true } },
      purchaseOrders: { orderBy: { createdAt: "desc" }, take: 100, select: { id: true, number: true, status: true, totalMinor: true, createdAt: true, orderedAt: true, receivedAt: true } },
    },
  });
  if (!supplier) return null;
  // Value of goods actually received (a partial PO only counts what arrived).
  const [spend] = await prisma.$queryRaw<{ total: bigint | null }[]>`
    SELECT SUM(l."receivedQty"::bigint * l."unitCostMinor") AS total
    FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" po ON po.id = l."purchaseOrderId"
    WHERE po."supplierId" = ${id}`;
  return { ...supplier, receivedSpendMinor: Number(spend?.total ?? 0) };
}
