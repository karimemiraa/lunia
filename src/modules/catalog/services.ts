import type { Department, Service } from "@prisma/client";
import { prisma } from "@/lib/db";

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
