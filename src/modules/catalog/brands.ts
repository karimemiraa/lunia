import { z } from "zod";
import type { Brand } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertValidSlug } from "./slug";

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

// Fetches a brand by id, or null if none matches. Used by the admin edit
// surface.
export async function getBrandById(id: string): Promise<Brand | null> {
  return prisma.brand.findUnique({ where: { id } });
}

const createBrandSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  descEn: z.string().min(1),
  descAr: z.string().min(1),
  whyChosenEn: z.string().min(1),
  whyChosenAr: z.string().min(1),
  url: z.string().nullable().optional(),
  logoMediaId: z.string().nullable().optional(),
  order: z.number().optional(),
  isPublished: z.boolean().optional(),
});
export type CreateBrandInput = z.infer<typeof createBrandSchema>;

const updateBrandSchema = createBrandSchema.omit({ slug: true }).partial();
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

// Validates `input` (throwing on invalid data, including a slug that's
// already taken), then creates a Brand row.
export async function createBrand(input: CreateBrandInput): Promise<Brand> {
  const data = createBrandSchema.parse(input);
  assertValidSlug(data.slug, "brand slug");

  const existing = await prisma.brand.findUnique({ where: { slug: data.slug } });
  if (existing) {
    throw new Error(`Brand with slug "${data.slug}" already exists`);
  }

  return prisma.brand.create({
    data: {
      slug: data.slug,
      name: data.name,
      descEn: data.descEn,
      descAr: data.descAr,
      whyChosenEn: data.whyChosenEn,
      whyChosenAr: data.whyChosenAr,
      url: data.url ?? null,
      logoMediaId: data.logoMediaId ?? null,
      order: data.order ?? 0,
      isPublished: data.isPublished ?? true,
    },
  });
}

// Slug is immutable after creation — public URLs (/brands/[slug]) key off it.
export async function updateBrand(id: string, input: UpdateBrandInput): Promise<Brand> {
  const data = updateBrandSchema.parse(input);

  const existing = await prisma.brand.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Brand "${id}" not found`);
  }

  return prisma.brand.update({
    where: { id },
    data: {
      name: data.name,
      descEn: data.descEn,
      descAr: data.descAr,
      whyChosenEn: data.whyChosenEn,
      whyChosenAr: data.whyChosenAr,
      url: data.url,
      logoMediaId: data.logoMediaId,
      order: data.order,
      isPublished: data.isPublished,
    },
  });
}

export async function deleteBrand(id: string): Promise<void> {
  const existing = await prisma.brand.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Brand "${id}" not found`);
  }
  await prisma.brand.delete({ where: { id } });
}
