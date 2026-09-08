// Read-side helpers over Service's booking-related fields (duration, price,
// online-booking eligibility). Mutating a service's catalog fields (name,
// summary, etc.) is handled by src/modules/catalog/services.ts; this module
// is scoped to what the booking flow needs to read.

import { z } from "zod";
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

// All published services, regardless of onlineBookable/inCenterOnly, for the
// front-desk/walk-in booking form: staff can book any published service
// in-center, including ones that are intentionally hidden from the public
// online flow (onlineBookable: false) or restricted to in-center-only
// delivery. createBooking only enforces the onlineBookable/inCenterOnly gate
// for channel === "ONLINE", so FRONT_DESK bookings are unaffected by it.
export async function getFrontDeskServices(): Promise<(Service & { department: Department })[]> {
  return prisma.service.findMany({
    where: { isPublished: true },
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

const updateServiceBookingSettingsSchema = z.object({
  durationMin: z.number().int().min(1),
  priceMinor: z.number().int().min(0),
  onlineBookable: z.boolean(),
  inCenterOnly: z.boolean(),
});
export type UpdateServiceBookingSettingsInput = z.infer<typeof updateServiceBookingSettingsSchema>;

// Write-side counterpart to getServiceBookingConfig, used by the admin
// catalog service editor (src/app/admin/catalog/services/[id]/*). Catalog
// content fields (name, summary, media, etc.) are handled separately by
// src/modules/catalog/services.ts's updateService.
export async function updateServiceBookingSettings(
  serviceId: string,
  input: UpdateServiceBookingSettingsInput,
): Promise<void> {
  const data = updateServiceBookingSettingsSchema.parse(input);

  const existing = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!existing) {
    throw new Error(`Service "${serviceId}" not found`);
  }

  await prisma.service.update({
    where: { id: serviceId },
    data: {
      durationMin: data.durationMin,
      priceMinor: data.priceMinor,
      onlineBookable: data.onlineBookable,
      inCenterOnly: data.inCenterOnly,
    },
  });
}
