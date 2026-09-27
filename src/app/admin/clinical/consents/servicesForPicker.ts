import { prisma } from "@/lib/db";

export async function servicesForPicker() {
  const services = await prisma.service.findMany({
    orderBy: [{ department: { order: "asc" } }, { order: "asc" }],
    select: { id: true, nameEn: true, department: { select: { nameEn: true } } },
  });
  return services.map((s) => ({ id: s.id, label: s.nameEn, group: s.department.nameEn }));
}
