// Read-side helpers over Service's booking-related fields (duration, price,
// online-booking eligibility). Mutating a service's catalog fields (name,
// summary, etc.) is handled by src/modules/catalog/services.ts; this module
// is scoped to what the booking flow needs to read.

import { prisma } from "@/lib/db";
import type { Department, Service } from "@prisma/client";

// Services eligible for the public online-booking flow: published and
// marked onlineBookable. (inCenterOnly services are excluded from ONLINE
// booking at the createBooking layer, not here, since front-desk/walk-in
// staff still need to see them.)
export async function getBookableServices(): Promise<(Service & { department: Department })[]> {
  return prisma.service.findMany({
    where: { isPublished: true, onlineBookable: true },
    include: { department: true },
    orderBy: [{ department: { order: "asc" } }, { order: "asc" }],
  });
}

export interface ServiceBookingConfig {
  durationMin: number;
  priceMinor: number;
  isPublished: boolean;
  onlineBookable: boolean;
  inCenterOnly: boolean;
}

// Reads just the booking-relevant fields of a single service, or null if it
// doesn't exist.
export async function getServiceBookingConfig(serviceId: string): Promise<ServiceBookingConfig | null> {
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) return null;
  return {
    durationMin: service.durationMin,
    priceMinor: service.priceMinor,
    isPublished: service.isPublished,
    onlineBookable: service.onlineBookable,
    inCenterOnly: service.inCenterOnly,
  };
}
