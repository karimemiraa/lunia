import type { Department, Service } from "@prisma/client";
import { prisma } from "@/lib/db";

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
