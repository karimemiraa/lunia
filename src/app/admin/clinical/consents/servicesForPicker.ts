import { prisma } from "@/lib/db";

export async function servicesForPicker() {
  const services = await prisma.service.findMany({
    orderBy: [{ department: { order: "asc" } }, { order: "asc" }],
    select: { id: true, nameEn: true, nameAr: true, department: { select: { nameEn: true, nameAr: true } } },
  });
  return services.map((s) => ({
    id: s.id,
    label: s.nameEn,
    group: s.department.nameEn,
    labelAr: s.nameAr || s.nameEn,
    groupAr: s.department.nameAr || s.department.nameEn,
  }));
}
