// Treatment records: what was actually done in a session (service, who,
// device settings/protocol, products used, reaction, follow-up). A record is
// either tied to one appointment (TreatmentRecord.appointmentId is unique, so
// an appointment has at most one record) or ad hoc.

import { z } from "zod";
import { prisma } from "@/lib/db";

const optionalId = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()
  .optional();

export const treatmentInputSchema = z.object({
  clientProfileId: z.string().min(1),
  appointmentId: optionalId,
  serviceId: optionalId,
  performedById: z.string().min(1),
  performedAt: z.coerce.date(),
  // Stored as an ordered list (JSONB objects don't keep key order), e.g.
  // [{ key: "Device", value: "Hydrafacial Syndeo" }, { key: "Passes", value: "3" }].
  settings: z
    .array(z.object({ key: z.string().trim().min(1).max(80), value: z.string().trim().max(300) }))
    .max(30)
    .default([]),
  productsUsed: z
    .array(
      z.object({
        productId: optionalId,
        name: z.string().trim().min(1).max(160),
        qty: z.string().trim().max(40).default(""),
        unit: z.string().trim().max(20).default(""),
      }),
    )
    .max(40)
    .default([]),
  notes: z.string().trim().max(5000).optional().nullable(),
  skinReaction: z.string().trim().max(500).optional().nullable(),
  followUpAt: z.coerce.date().optional().nullable(),
});
export type TreatmentInput = z.input<typeof treatmentInputSchema>;

export interface TreatmentSetting {
  key: string;
  value: string;
}
export interface TreatmentProduct {
  productId?: string | null;
  name: string;
  qty: string;
  unit: string;
}

function asSettings(raw: unknown): TreatmentSetting[] {
  if (Array.isArray(raw)) return raw.filter((r): r is TreatmentSetting => typeof r?.key === "string");
  // Tolerate a plain object ({ device, passes }) written by other tools.
  if (raw && typeof raw === "object") return Object.entries(raw).map(([key, value]) => ({ key, value: String(value) }));
  return [];
}
function asProducts(raw: unknown): TreatmentProduct[] {
  return Array.isArray(raw) ? raw.filter((r): r is TreatmentProduct => typeof r?.name === "string") : [];
}

async function assertAppointmentBelongs(appointmentId: string, clientProfileId: string) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { booking: { select: { clientProfileId: true } } },
  });
  if (!appt || appt.booking.clientProfileId !== clientProfileId) throw new Error("Appointment not found for this customer");
}

// performedById / serviceId are soft references (no FK), so check them here.
async function assertRefs(data: { performedById: string; serviceId?: string | null }) {
  const staff = await prisma.user.findUnique({ where: { id: data.performedById }, select: { type: true } });
  if (!staff || staff.type !== "STAFF") throw new Error("Choose the staff member who performed the treatment");
  if (data.serviceId && !(await prisma.service.findUnique({ where: { id: data.serviceId }, select: { id: true } }))) {
    throw new Error("Service not found");
  }
}

export async function createTreatmentRecord(input: TreatmentInput) {
  const data = treatmentInputSchema.parse(input);
  await assertRefs(data);
  if (data.appointmentId) {
    await assertAppointmentBelongs(data.appointmentId, data.clientProfileId);
    const existing = await prisma.treatmentRecord.findUnique({ where: { appointmentId: data.appointmentId } });
    if (existing) throw new Error("This appointment already has a treatment record");
  }
  return prisma.treatmentRecord.create({
    data: {
      clientProfileId: data.clientProfileId,
      appointmentId: data.appointmentId ?? null,
      serviceId: data.serviceId ?? null,
      performedById: data.performedById,
      performedAt: data.performedAt,
      settings: data.settings,
      productsUsed: data.productsUsed,
      notes: data.notes || null,
      skinReaction: data.skinReaction || null,
      followUpAt: data.followUpAt ?? null,
    },
  });
}

export async function updateTreatmentRecord(id: string, input: TreatmentInput) {
  const data = treatmentInputSchema.parse(input);
  const current = await prisma.treatmentRecord.findUnique({ where: { id } });
  if (!current || current.clientProfileId !== data.clientProfileId) throw new Error("Treatment record not found");
  await assertRefs(data);
  if (data.appointmentId && data.appointmentId !== current.appointmentId) {
    await assertAppointmentBelongs(data.appointmentId, data.clientProfileId);
  }
  return prisma.treatmentRecord.update({
    where: { id },
    data: {
      appointmentId: data.appointmentId ?? null,
      serviceId: data.serviceId ?? null,
      performedById: data.performedById,
      performedAt: data.performedAt,
      settings: data.settings,
      productsUsed: data.productsUsed,
      notes: data.notes || null,
      skinReaction: data.skinReaction || null,
      followUpAt: data.followUpAt ?? null,
    },
  });
}

export interface TreatmentRow {
  id: string;
  appointmentId: string | null;
  serviceId: string | null;
  serviceName: string | null;
  performedById: string;
  performedByName: string;
  performedAt: Date;
  settings: TreatmentSetting[];
  productsUsed: TreatmentProduct[];
  notes: string | null;
  skinReaction: string | null;
  followUpAt: Date | null;
  photoCount: number;
}

async function hydrate(
  records: {
    id: string;
    appointmentId: string | null;
    serviceId: string | null;
    performedById: string;
    performedAt: Date;
    settings: unknown;
    productsUsed: unknown;
    notes: string | null;
    skinReaction: string | null;
    followUpAt: Date | null;
    _count: { photos: number };
  }[],
): Promise<TreatmentRow[]> {
  const serviceIds = [...new Set(records.map((r) => r.serviceId).filter((v): v is string => Boolean(v)))];
  const staffIds = [...new Set(records.map((r) => r.performedById))];
  const [services, staff] = await Promise.all([
    prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, nameEn: true } }),
    prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, email: true, staffProfile: { select: { fullName: true } } } }),
  ]);
  const serviceName = new Map(services.map((s) => [s.id, s.nameEn]));
  const staffName = new Map(staff.map((s) => [s.id, s.staffProfile?.fullName || s.email || "Staff"]));
  return records.map((r) => ({
    id: r.id,
    appointmentId: r.appointmentId,
    serviceId: r.serviceId,
    serviceName: r.serviceId ? (serviceName.get(r.serviceId) ?? null) : null,
    performedById: r.performedById,
    performedByName: staffName.get(r.performedById) ?? "Staff",
    performedAt: r.performedAt,
    settings: asSettings(r.settings),
    productsUsed: asProducts(r.productsUsed),
    notes: r.notes,
    skinReaction: r.skinReaction,
    followUpAt: r.followUpAt,
    photoCount: r._count.photos,
  }));
}

export async function listTreatmentRecords(clientProfileId: string): Promise<TreatmentRow[]> {
  const records = await prisma.treatmentRecord.findMany({
    where: { clientProfileId },
    orderBy: { performedAt: "desc" },
    include: { _count: { select: { photos: true } } },
  });
  return hydrate(records);
}

export async function getTreatmentRecord(id: string): Promise<(TreatmentRow & { clientProfileId: string }) | null> {
  const record = await prisma.treatmentRecord.findUnique({ where: { id }, include: { _count: { select: { photos: true } } } });
  if (!record) return null;
  const [row] = await hydrate([record]);
  return { ...row, clientProfileId: record.clientProfileId };
}

/** Prefill for a record started from an appointment (calendar / customer page). */
export async function getAppointmentForTreatment(appointmentId: string) {
  return prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      serviceId: true,
      staffUserId: true,
      startAt: true,
      booking: { select: { id: true, clientProfileId: true } },
    },
  });
}

/** Active products for the optional picker (read-only use of the inventory table). */
export async function listProductOptions() {
  return prisma.product.findMany({
    where: { isActive: true },
    orderBy: { nameEn: "asc" },
    select: { id: true, nameEn: true, brandName: true, unit: true },
    take: 500,
  });
}
