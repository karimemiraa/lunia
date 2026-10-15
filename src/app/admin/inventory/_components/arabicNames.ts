import "server-only";
import { prisma } from "@/lib/db";
import type { StaffLocale } from "../../_i18n/t";

/**
 * Arabic product names by product id, for screens whose module queries only
 * select nameEn. Empty (and no query) in English mode.
 */
export async function arabicProductNames(locale: StaffLocale, ids?: string[]): Promise<Map<string, string>> {
  if (locale !== "ar") return new Map();
  const rows = await prisma.product.findMany({
    where: { nameAr: { not: null }, ...(ids ? { id: { in: ids } } : {}) },
    select: { id: true, nameAr: true },
  });
  return new Map(rows.filter((r) => r.nameAr).map((r) => [r.id, r.nameAr!]));
}
