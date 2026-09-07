import type { Brand } from "@prisma/client";
import { prisma } from "@/lib/db";

// Lists brands ordered for display. Public callers only want published
// ones; pass publishedOnly: false to see everything (e.g. admin CMS).
export async function listBrands(opts?: { publishedOnly?: boolean }): Promise<Brand[]> {
  const publishedOnly = opts?.publishedOnly ?? true;
  return prisma.brand.findMany({
    where: publishedOnly ? { isPublished: true } : undefined,
    orderBy: { order: "asc" },
  });
}

// Fetches a brand by slug, or null if none matches.
export async function getBrandBySlug(slug: string): Promise<Brand | null> {
  return prisma.brand.findUnique({ where: { slug } });
}
