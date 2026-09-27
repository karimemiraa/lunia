import { prisma } from "@/lib/db";
import { listProductOptions } from "@/modules/clinical/treatments";
import { utcToCenterLocal } from "@/modules/booking/availability";

export async function loadTreatmentOptions() {
  const [services, staff, products] = await Promise.all([
    prisma.service.findMany({ orderBy: [{ departmentId: "asc" }, { order: "asc" }], select: { id: true, nameEn: true } }),
    prisma.user.findMany({
      where: { type: "STAFF", isActive: true },
      select: { id: true, email: true, staffProfile: { select: { fullName: true } } },
      orderBy: { createdAt: "asc" },
    }),
    listProductOptions(),
  ]);
  return {
    services: services.map((s) => ({ id: s.id, label: s.nameEn })),
    staff: staff.map((s) => ({ id: s.id, label: s.staffProfile?.fullName || s.email || "Staff" })),
    products: products.map((p) => ({ id: p.id, label: p.brandName ? `${p.nameEn} (${p.brandName})` : p.nameEn, unit: p.unit })),
  };
}

/** Center-local "YYYY-MM-DDTHH:mm" for a datetime-local input. */
export function toLocalInput(date: Date): string {
  const { dateISO, minutes } = utcToCenterLocal(date);
  return `${dateISO}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
