import { z } from "zod";
import type { Department, Service } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertValidSlug } from "./slug";

// Lists departments ordered for display. Public callers (the marketing
// site) only want published ones; the admin CMS passes publishedOnly:
// false (or omits it) to see everything.
export async function listDepartments(opts?: { publishedOnly?: boolean }): Promise<Department[]> {
  const publishedOnly = opts?.publishedOnly ?? true;
  return prisma.department.findMany({
    where: publishedOnly ? { isPublished: true } : undefined,
    orderBy: { order: "asc" },
  });
}

// Fetches a department by slug along with its services (ordered), or null
// if no department has that slug.
export async function getDepartmentBySlug(
  slug: string,
): Promise<(Department & { services: Service[] }) | null> {
  return prisma.department.findUnique({
    where: { slug },
    include: { services: { orderBy: { order: "asc" } } },
  });
}

// Fetches a department by id, or null if none matches. Used by the admin
// edit surface (list pages use listDepartments; the id route needs a single
// row, unpublished or not).
export async function getDepartmentById(id: string): Promise<Department | null> {
  return prisma.department.findUnique({ where: { id } });
}

const createDepartmentSchema = z.object({
  slug: z.string().min(1),
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  taglineEn: z.string().min(1),
  taglineAr: z.string().min(1),
  descEn: z.string().min(1),
  descAr: z.string().min(1),
  heroMediaId: z.string().nullable().optional(),
  order: z.number().optional(),
  isPublished: z.boolean().optional(),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

const updateDepartmentSchema = createDepartmentSchema.omit({ slug: true }).partial();
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

// Validates `input` (throwing on invalid data, including a slug that's
// already taken), then creates a Department row.
export async function createDepartment(input: CreateDepartmentInput): Promise<Department> {
  const data = createDepartmentSchema.parse(input);
  assertValidSlug(data.slug, "department slug");

  const existing = await prisma.department.findUnique({ where: { slug: data.slug } });
  if (existing) {
    throw new Error(`Department with slug "${data.slug}" already exists`);
  }

  return prisma.department.create({
    data: {
      slug: data.slug,
      nameEn: data.nameEn,
      nameAr: data.nameAr,
      taglineEn: data.taglineEn,
      taglineAr: data.taglineAr,
      descEn: data.descEn,
      descAr: data.descAr,
      heroMediaId: data.heroMediaId ?? null,
      order: data.order ?? 0,
      isPublished: data.isPublished ?? true,
    },
  });
}

// Slug is immutable after creation — the edit form doesn't expose it, and
// public URLs (/services/[slug]) key off it.
export async function updateDepartment(id: string, input: UpdateDepartmentInput): Promise<Department> {
  const data = updateDepartmentSchema.parse(input);

  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Department "${id}" not found`);
  }

  return prisma.department.update({
    where: { id },
    data: {
      nameEn: data.nameEn,
      nameAr: data.nameAr,
      taglineEn: data.taglineEn,
      taglineAr: data.taglineAr,
      descEn: data.descEn,
      descAr: data.descAr,
      heroMediaId: data.heroMediaId,
      order: data.order,
      isPublished: data.isPublished,
    },
  });
}

// Deleting a department cascades to its services (onDelete: Cascade in the
// Prisma schema) — the admin UI should warn accordingly before calling this.
export async function deleteDepartment(id: string): Promise<void> {
  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Department "${id}" not found`);
  }
  await prisma.department.delete({ where: { id } });
}
