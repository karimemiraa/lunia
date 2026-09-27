// Service bill of materials (what one session of a service uses from stock)
// and the automatic deduction when a booking is completed.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { recordStockMovement } from "./stock";

export function listServiceConsumables(serviceId: string) {
  return prisma.serviceConsumable.findMany({
    where: { serviceId },
    include: { product: { select: { id: true, nameEn: true, unit: true, stockQty: true, costMinor: true } } },
    orderBy: { product: { nameEn: "asc" } },
  });
}

/** Services whose bill of materials uses this product (for the product page). */
export function listServicesUsingProduct(productId: string) {
  return prisma.serviceConsumable.findMany({
    where: { productId },
    include: { service: { select: { id: true, nameEn: true } } },
    orderBy: { service: { nameEn: "asc" } },
  });
}

export const consumablesSchema = z.object({
  serviceId: z.string().min(1),
  items: z
    .array(z.object({ productId: z.string().min(1), qty: z.number().int().min(1).max(100_000) }))
    .max(100)
    .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, "Each product can be listed once"),
});
export type ConsumablesInput = z.input<typeof consumablesSchema>;

/** Replaces the whole bill of materials for a service. */
export async function setServiceConsumables(input: ConsumablesInput) {
  const { serviceId, items } = consumablesSchema.parse(input);
  await prisma.$transaction([
    prisma.serviceConsumable.deleteMany({ where: { serviceId } }),
    prisma.serviceConsumable.createMany({ data: items.map((i) => ({ serviceId, productId: i.productId, qty: i.qty })) }),
  ]);
}

/**
 * Deducts each appointment's service consumables as CONSUMPTION movements
 * (refType APPOINTMENT, refId appointment id). Idempotent: an appointment that
 * already has consumption movements is skipped, and a per-booking advisory
 * lock stops two concurrent calls from both passing that check. Stock is
 * allowed to go negative -- a treatment already happened, so we record it and
 * let the low-stock alert flag the shortfall.
 */
export async function consumeForBooking(bookingId: string, actorId?: string): Promise<{ movements: number }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"lunia:consume:" + bookingId}))`;
    const appointments = await tx.appointment.findMany({
      where: { bookingId },
      select: { id: true, serviceId: true },
    });
    if (appointments.length === 0) return { movements: 0 };

    const already = await tx.stockMovement.findMany({
      where: { refType: "APPOINTMENT", refId: { in: appointments.map((a) => a.id) }, type: "CONSUMPTION" },
      select: { refId: true },
      distinct: ["refId"],
    });
    const done = new Set(already.map((m) => m.refId));
    const pending = appointments.filter((a) => !done.has(a.id));
    if (pending.length === 0) return { movements: 0 };

    const boms = await tx.serviceConsumable.findMany({
      where: { serviceId: { in: [...new Set(pending.map((a) => a.serviceId))] } },
      include: { product: { select: { costMinor: true } } },
    });

    let movements = 0;
    for (const appt of pending) {
      for (const item of boms.filter((b) => b.serviceId === appt.serviceId)) {
        await recordStockMovement(
          {
            productId: item.productId,
            qty: -item.qty,
            type: "CONSUMPTION",
            refType: "APPOINTMENT",
            refId: appt.id,
            unitCostMinor: item.product.costMinor,
            note: "Used in treatment",
            createdById: actorId,
          },
          tx,
        );
        movements += 1;
      }
    }
    return { movements };
  });
}
