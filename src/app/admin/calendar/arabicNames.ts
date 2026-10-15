import "server-only";
import { prisma } from "@/lib/db";
import type { StaffLocale } from "../_i18n/t";

// Arabic display names for the services, staff and rooms the scheduling
// screens show. The booking read models only carry English names, so in
// Arabic mode we look up Service.nameAr / StaffProfile.fullNameAr / Room.nameAr
// for the ids on screen (one small query each) and fall back to English.

export interface ArabicNames {
  service: Map<string, string>;
  staff: Map<string, string>;
  room: Map<string, string>;
}

const filled = (v: string | null | undefined): v is string => Boolean(v && v.trim());

export async function loadArabicNames(
  locale: StaffLocale,
  ids: { serviceIds?: Iterable<string>; staffUserIds?: Iterable<string>; roomIds?: Iterable<string> },
): Promise<ArabicNames> {
  const names: ArabicNames = { service: new Map(), staff: new Map(), room: new Map() };
  if (locale !== "ar") return names;
  const serviceIds = [...new Set(ids.serviceIds ?? [])];
  const staffUserIds = [...new Set(ids.staffUserIds ?? [])];
  const roomIds = [...new Set(ids.roomIds ?? [])];
  const [services, staff, rooms] = await Promise.all([
    serviceIds.length ? prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, nameAr: true } }) : [],
    staffUserIds.length ? prisma.staffProfile.findMany({ where: { userId: { in: staffUserIds } }, select: { userId: true, fullNameAr: true } }) : [],
    roomIds.length ? prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, nameAr: true } }) : [],
  ]);
  for (const s of services) if (filled(s.nameAr)) names.service.set(s.id, s.nameAr);
  for (const s of staff) if (filled(s.fullNameAr)) names.staff.set(s.userId, s.fullNameAr);
  for (const r of rooms) if (filled(r.nameAr)) names.room.set(r.id, r.nameAr);
  return names;
}

/** Swaps in Arabic service/staff/room names on calendar rows (English fallback). */
export function localizeRows<R extends { serviceId: string; serviceName: string; staffUserId: string; staffName: string; roomId: string; roomName: string }>(rows: R[], names: ArabicNames): R[] {
  return rows.map((r) => ({
    ...r,
    serviceName: names.service.get(r.serviceId) ?? r.serviceName,
    staffName: names.staff.get(r.staffUserId) ?? r.staffName,
    roomName: names.room.get(r.roomId) ?? r.roomName,
  }));
}
