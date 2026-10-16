import { prisma } from "@/lib/db";
import type { StaffLocale } from "../_i18n/t";

/** Active staff for the invoice editor's "Done by / Sold by" (commission). */
export async function staffOptions(locale: StaffLocale): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.user.findMany({
    where: { type: "STAFF", isActive: true, staffProfile: { isNot: null } },
    select: { id: true, staffProfile: { select: { fullName: true, fullNameAr: true } } },
  });
  return rows
    .map((u) => ({ id: u.id, name: (locale === "ar" && u.staffProfile?.fullNameAr?.trim()) || u.staffProfile?.fullName || "" }))
    .filter((s) => s.name)
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

/** The booking's (first) specialist — default "Sold by" for products added at checkout. */
export async function bookingSpecialist(bookingId: string): Promise<string | null> {
  const a = await prisma.appointment.findFirst({ where: { bookingId }, orderBy: { startAt: "asc" }, select: { staffUserId: true } });
  return a?.staffUserId ?? null;
}
