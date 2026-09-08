import { z } from "zod";
import type { Department, Service } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertValidSlug } from "./slug";

// Lists services ordered for display, optionally scoped to one department.
// Public callers only want published ones; pass publishedOnly: false to see
// everything (e.g. from the admin CMS).
export async function listServices(
  departmentId?: string,
  opts?: { publishedOnly?: boolean },
): Promise<Service[]> {
  const publishedOnly = opts?.publishedOnly ?? true;
  return prisma.service.findMany({
    where: {
      ...(departmentId ? { departmentId } : {}),
      ...(publishedOnly ? { isPublished: true } : {}),
    },
    orderBy: { order: "asc" },
  });
}

// Fetches a service by slug along with its parent department, or null if no
// service has that slug.
export async function getServiceBySlug(
  slug: string,
): Promise<(Service & { department: Department }) | null> {
  return prisma.service.findUnique({
    where: { slug },
    include: { department: true },
  });
}

// Fetches a service by id, or null if none matches. Used by the admin edit
// surface.
export async function getServiceById(id: string): Promise<Service | null> {
  return prisma.service.findUnique({ where: { id } });
}

const createServiceSchema = z.object({
  slug: z.string().min(1),
  departmentId: z.string().min(1),
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  summaryEn: z.string().min(1),
  summaryAr: z.string().min(1),
  benefitsEn: z.array(z.string()).optional(),
  benefitsAr: z.array(z.string()).optional(),
  heroMediaId: z.string().nullable().optional(),
  order: z.number().optional(),
  isPublished: z.boolean().optional(),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

const updateServiceSchema = createServiceSchema.omit({ slug: true }).partial();
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

// Validates `input` (throwing on invalid data, including a slug that's
// already taken or a departmentId that doesn't exist), then creates a
// Service row. benefitsEn/benefitsAr are stored as Json (string[]).
export async function createService(input: CreateServiceInput): Promise<Service> {
  const data = createServiceSchema.parse(input);
  assertValidSlug(data.slug, "service slug");

  const [existingSlug, department] = await Promise.all([
    prisma.service.findUnique({ where: { slug: data.slug } }),
    prisma.department.findUnique({ where: { id: data.departmentId } }),
  ]);
  if (existingSlug) {
    throw new Error(`Service with slug "${data.slug}" already exists`);
  }
  if (!department) {
    throw new Error(`Department "${data.departmentId}" not found`);
  }

  return prisma.service.create({
    data: {
      slug: data.slug,
      departmentId: data.departmentId,
      nameEn: data.nameEn,
      nameAr: data.nameAr,
      summaryEn: data.summaryEn,
      summaryAr: data.summaryAr,
      benefitsEn: data.benefitsEn ?? [],
      benefitsAr: data.benefitsAr ?? [],
      heroMediaId: data.heroMediaId ?? null,
      order: data.order ?? 0,
      isPublished: data.isPublished ?? true,
    },
  });
}

// Slug is immutable after creation — public URLs (/services/[dept]#[slug])
// key off it.
export async function updateService(id: string, input: UpdateServiceInput): Promise<Service> {
  const data = updateServiceSchema.parse(input);

  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Service "${id}" not found`);
  }

  if (data.departmentId) {
    const department = await prisma.department.findUnique({ where: { id: data.departmentId } });
    if (!department) {
      throw new Error(`Department "${data.departmentId}" not found`);
    }
  }

  return prisma.service.update({
    where: { id },
    data: {
      departmentId: data.departmentId,
      nameEn: data.nameEn,
      nameAr: data.nameAr,
      summaryEn: data.summaryEn,
      summaryAr: data.summaryAr,
      benefitsEn: data.benefitsEn,
      benefitsAr: data.benefitsAr,
      heroMediaId: data.heroMediaId,
      order: data.order,
      isPublished: data.isPublished,
    },
  });
}

export async function deleteService(id: string): Promise<void> {
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Service "${id}" not found`);
  }
  await prisma.service.delete({ where: { id } });
}
