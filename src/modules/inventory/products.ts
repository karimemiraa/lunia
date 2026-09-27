// Product catalogue for inventory: retail products sold at the front desk and
// consumables used in treatments. Stock levels are NOT edited here -- they
// only change through recordStockMovement (see stock.ts).

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordStockMovement } from "./stock";
import { PRODUCT_KINDS, PRODUCT_UNITS } from "./money";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const productInputSchema = z.object({
  sku: optionalText(64),
  barcode: optionalText(64),
  nameEn: z.string().trim().min(1, "English name is required").max(200),
  nameAr: optionalText(200),
  brandName: optionalText(120),
  supplierId: optionalText(64),
  category: optionalText(80),
  unit: z.enum(PRODUCT_UNITS),
  kind: z.enum(PRODUCT_KINDS),
  costMinor: z.number().int().min(0).max(100_000_000),
  priceMinor: z.number().int().min(0).max(100_000_000),
  vatRateBp: z.number().int().min(0).max(10_000),
  reorderLevel: z.number().int().min(0).max(1_000_000),
  isActive: z.boolean(),
});
export type ProductInput = z.input<typeof productInputSchema>;

export const createProductSchema = productInputSchema.extend({
  openingQty: z.number().int().min(0).max(1_000_000).default(0),
});
export type CreateProductInput = z.input<typeof createProductSchema>;

// Turns a unique-constraint violation on sku/barcode into a readable message.
function friendlyUniqueError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = JSON.stringify(err.meta ?? {});
    if (target.includes("barcode")) throw new Error("Another product already uses this barcode.");
    if (target.includes("sku")) throw new Error("Another product already uses this SKU.");
    throw new Error("A product with these details already exists.");
  }
  throw err;
}

export async function createProduct(input: CreateProductInput, actorId?: string) {
  const { openingQty, ...data } = createProductSchema.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ data });
      if (openingQty > 0) {
        await recordStockMovement(
          {
            productId: product.id,
            qty: openingQty,
            type: "ADJUSTMENT",
            refType: "MANUAL",
            unitCostMinor: data.costMinor,
            note: "Opening stock",
            createdById: actorId,
          },
          tx,
        );
      }
      return product;
    });
  } catch (err) {
    friendlyUniqueError(err);
  }
}

export async function updateProduct(id: string, input: ProductInput) {
  const data = productInputSchema.parse(input);
  try {
    return await prisma.product.update({ where: { id }, data });
  } catch (err) {
    friendlyUniqueError(err);
  }
}

export function getProduct(id: string) {
  return prisma.product.findUnique({ where: { id }, include: { supplier: { select: { id: true, name: true } } } });
}

/**
 * Exact lookup for the barcode scanner / quick find box: a scanner "types" the
 * code and presses Enter, so this matches barcode first, then SKU.
 */
export async function findProductByCode(code: string) {
  const trimmed = code.trim();
  if (!trimmed) return null;
  return (
    (await prisma.product.findUnique({ where: { barcode: trimmed } })) ??
    (await prisma.product.findUnique({ where: { sku: trimmed } })) ??
    (await prisma.product.findFirst({ where: { sku: { equals: trimmed, mode: "insensitive" } } }))
  );
}

export interface ProductFilters {
  q?: string;
  kind?: string;
  category?: string;
  supplierId?: string;
  lowStock?: boolean;
  /** Show inactive products too (default: active only). */
  includeInactive?: boolean;
}

// "Low stock" = at/below a set reorder level, or negative (consumed more than
// was ever received -- always worth a look even without a reorder level).
export function lowStockWhere(): Prisma.ProductWhereInput {
  return {
    OR: [
      { reorderLevel: { gt: 0 }, stockQty: { lte: prisma.product.fields.reorderLevel } },
      { stockQty: { lt: 0 } },
    ],
  };
}

export async function listProducts(filters: ProductFilters = {}) {
  const and: Prisma.ProductWhereInput[] = [];
  const q = filters.q?.trim();
  if (q) {
    and.push({
      OR: [
        { nameEn: { contains: q, mode: "insensitive" } },
        { nameAr: { contains: q, mode: "insensitive" } },
        { brandName: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q } },
      ],
    });
  }
  if (filters.kind && (PRODUCT_KINDS as readonly string[]).includes(filters.kind)) {
    // A BOTH product is also a retail product and a consumable.
    and.push({ kind: { in: filters.kind === "BOTH" ? ["BOTH"] : [filters.kind, "BOTH"] } });
  }
  if (filters.category) and.push({ category: filters.category });
  if (filters.supplierId) and.push({ supplierId: filters.supplierId });
  if (filters.lowStock) and.push(lowStockWhere());
  if (!filters.includeInactive) and.push({ isActive: true });

  return prisma.product.findMany({
    where: { AND: and },
    include: { supplier: { select: { id: true, name: true } } },
    orderBy: [{ isActive: "desc" }, { nameEn: "asc" }],
    take: 500,
  });
}

export async function listCategories(): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: { category: { not: null } },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return rows.map((r) => r.category).filter((c): c is string => !!c);
}

/** Lightweight option list for pickers (PO lines, service consumables). */
export function listProductOptions(opts: { consumablesOnly?: boolean } = {}) {
  return prisma.product.findMany({
    where: { isActive: true, ...(opts.consumablesOnly ? { kind: { in: ["CONSUMABLE", "BOTH"] } } : {}) },
    select: { id: true, nameEn: true, sku: true, unit: true, costMinor: true, stockQty: true, reorderLevel: true, supplierId: true },
    orderBy: { nameEn: "asc" },
  });
}
