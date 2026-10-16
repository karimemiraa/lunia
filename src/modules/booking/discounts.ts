// Specialist discounts on a visit (docs/PRD-commission-discounts-roles.md §3.2).
//
// A specialist (discount:give) can discount her own customer's appointment
// from consultation until the invoice is issued. Up to her cap (HR file, else
// Settings → Discounts, default 10%) it is APPLIED at once; above it waits as
// PENDING for someone with discount:approve. An APPLIED discount becomes the
// line discount when front desk opens the invoice, and commission is then
// worked out on the discounted amount (hr/commission.ts).

import { prisma } from "@/lib/db";
import { PERMISSIONS, type PermissionKey } from "@/modules/iam/permissions";
import { getSetting, DEFAULT_DISCOUNT_SETTINGS, type DiscountSettings } from "@/modules/cms/settings";

export class DiscountError extends Error {}

export const DISCOUNT_REASONS = ["Returning customer", "Session ran over", "Introductory offer", "Service recovery", "Family or friend of a regular"] as const;

export async function getDiscountSettings(): Promise<DiscountSettings> {
  return { ...DEFAULT_DISCOUNT_SETTINGS, ...((await getSetting("discounts").catch(() => null)) ?? {}) };
}

/** The % a person may give without approval (her HR file, else the setting). */
export async function capPctFor(userId: string): Promise<number> {
  const [rec, settings] = await Promise.all([
    prisma.employeeRecord.findUnique({ where: { userId }, select: { discountCapPct: true } }),
    getDiscountSettings(),
  ]);
  return rec?.discountCapPct ?? settings.specialistCapPct;
}

/** Pure: does this discount need a manager? */
export function needsApproval(input: { amountMinor: number; priceMinor: number; capPct: number; maxMinor: number | null; canApprove: boolean }): boolean {
  if (input.canApprove) return false;
  if (input.maxMinor !== null && input.amountMinor > input.maxMinor) return true;
  return input.amountMinor * 100 > input.priceMinor * input.capPct;
}

/** Pure: amount from a % or an amount, clamped and validated against the price. */
export function discountAmount(priceMinor: number, by: { pct?: number; amountMinor?: number }): number {
  const amount = by.pct !== undefined ? Math.round((priceMinor * by.pct) / 100) : Math.round(by.amountMinor ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new DiscountError("Enter a discount above zero.");
  if (amount > priceMinor) throw new DiscountError("The discount can't be more than the visit price.");
  return amount;
}

async function loadAppointment(appointmentId: string) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { booking: { select: { id: true, status: true, checkIn: { select: { id: true, stage: true } } } }, discount: true },
  });
  if (!appt) throw new DiscountError("Appointment not found.");
  return appt;
}

async function assertInvoiceOpen(bookingId: string) {
  const issued = await prisma.invoice.count({ where: { bookingId, kind: "INVOICE", status: { notIn: ["DRAFT", "VOID"] } } });
  if (issued > 0) throw new DiscountError("The invoice is already issued — ask the front desk for a credit note instead.");
}

async function timeline(checkInId: string | undefined, stage: string | undefined, kind: string, byUserId: string, note: string) {
  if (!checkInId || !stage) return;
  await prisma.visitEvent.create({ data: { checkInId, stage: stage as never, kind, byUserId, note: note.slice(0, 300) } });
}

export interface GiveDiscountInput {
  appointmentId: string;
  byUserId: string;
  permissions: Set<PermissionKey>;
  pct?: number;
  amountMinor?: number;
  reason: string;
}

export async function giveDiscount(input: GiveDiscountInput): Promise<{ status: "APPLIED" | "PENDING"; amountMinor: number; pctBp: number }> {
  const canApprove = input.permissions.has(PERMISSIONS.DISCOUNT_APPROVE);
  const canGive = input.permissions.has(PERMISSIONS.DISCOUNT_GIVE);
  if (!canApprove && !canGive) throw new DiscountError("You don't have permission to give discounts.");
  const reason = input.reason.trim();
  if (!reason) throw new DiscountError("Say why you're giving the discount.");

  const appt = await loadAppointment(input.appointmentId);
  if (!canApprove && appt.staffUserId !== input.byUserId) throw new DiscountError("You can only discount your own customers.");
  if (!["CONFIRMED", "CHECKED_IN"].includes(appt.booking.status)) throw new DiscountError("This visit is already closed.");
  await assertInvoiceOpen(appt.booking.id);
  if (appt.priceMinorSnapshot <= 0) throw new DiscountError("This visit has no price to discount.");

  const amountMinor = discountAmount(appt.priceMinorSnapshot, { pct: input.pct, amountMinor: input.amountMinor });
  const pctBp = Math.round((amountMinor * 10_000) / appt.priceMinorSnapshot);
  const settings = await getDiscountSettings();
  const pending = needsApproval({ amountMinor, priceMinor: appt.priceMinorSnapshot, capPct: await capPctFor(input.byUserId), maxMinor: settings.maxMinor, canApprove });
  const status = pending ? "PENDING" : "APPLIED";
  const data = {
    amountMinor, pctBp, reason: reason.slice(0, 200), status, requestedById: input.byUserId,
    decidedById: pending ? null : input.byUserId, decidedAt: pending ? null : new Date(), invoiceId: null,
  };
  await prisma.appointmentDiscount.upsert({ where: { appointmentId: appt.id }, create: { appointmentId: appt.id, ...data }, update: data });
  await timeline(appt.booking.checkIn?.id, appt.booking.checkIn?.stage, pending ? "discount_requested" : "discount_given", input.byUserId, `${pctBp / 100}% · ${reason}`);
  return { status, amountMinor, pctBp };
}

export async function decideDiscount(appointmentId: string, byUserId: string, permissions: Set<PermissionKey>, approve: boolean): Promise<void> {
  if (!permissions.has(PERMISSIONS.DISCOUNT_APPROVE)) throw new DiscountError("Only a manager can approve discounts.");
  const appt = await loadAppointment(appointmentId);
  if (!appt.discount || appt.discount.status !== "PENDING") throw new DiscountError("There's no discount waiting on this visit.");
  await assertInvoiceOpen(appt.booking.id);
  // Conditional update: two managers tapping at once can't both decide.
  const res = await prisma.appointmentDiscount.updateMany({
    where: { appointmentId, status: "PENDING" },
    data: { status: approve ? "APPLIED" : "DECLINED", decidedById: byUserId, decidedAt: new Date() },
  });
  if (res.count !== 1) throw new DiscountError("Someone else just decided this discount — refresh and try again.");
  await timeline(appt.booking.checkIn?.id, appt.booking.checkIn?.stage, approve ? "discount_approved" : "discount_declined", byUserId, `${appt.discount.pctBp / 100}%`);
}

export async function removeDiscount(appointmentId: string, byUserId: string, permissions: Set<PermissionKey>): Promise<void> {
  const appt = await loadAppointment(appointmentId);
  if (!appt.discount) return;
  const own = appt.discount.requestedById === byUserId;
  if (!own && !permissions.has(PERMISSIONS.DISCOUNT_APPROVE)) throw new DiscountError("You can only remove a discount you gave.");
  await assertInvoiceOpen(appt.booking.id);
  await prisma.appointmentDiscount.delete({ where: { appointmentId } });
}

/** APPLIED discounts per appointment of a booking, for pre-filling its invoice. */
export async function appliedDiscounts(bookingId: string): Promise<Map<string, { appointmentId: string; serviceId: string; staffUserId: string; amountMinor: number; reason: string; byName: string }>> {
  const rows = await prisma.appointmentDiscount.findMany({
    where: { status: "APPLIED", appointment: { bookingId } },
    include: { appointment: { select: { id: true, serviceId: true, staffUserId: true } } },
  });
  const names = new Map(
    (await prisma.staffProfile.findMany({ where: { userId: { in: rows.map((r) => r.requestedById) } }, select: { userId: true, fullName: true } })).map((p) => [p.userId, p.fullName]),
  );
  return new Map(rows.map((r) => [r.appointment.id, { appointmentId: r.appointment.id, serviceId: r.appointment.serviceId, staffUserId: r.appointment.staffUserId, amountMinor: r.amountMinor, reason: r.reason, byName: names.get(r.requestedById) ?? "" }]));
}

/** After the invoice is issued: lock the booking's discounts to it. */
export async function lockDiscountsToInvoice(bookingId: string, invoiceId: string): Promise<void> {
  await prisma.appointmentDiscount.updateMany({ where: { appointment: { bookingId }, status: "APPLIED", invoiceId: null }, data: { invoiceId } });
  // Anything still waiting can no longer apply.
  await prisma.appointmentDiscount.updateMany({ where: { appointment: { bookingId }, status: "PENDING" }, data: { status: "DECLINED", decidedAt: new Date() } });
}

/** Discounts waiting for a manager (notifications + board). */
export async function pendingDiscounts(take = 20) {
  const where = { status: "PENDING" };
  const [count, rows] = await Promise.all([
    prisma.appointmentDiscount.count({ where }),
    prisma.appointmentDiscount.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      include: { appointment: { select: { id: true, booking: { select: { client: { select: { fullName: true } } } }, staff: { select: { staffProfile: { select: { fullName: true } } } } } } },
    }),
  ]);
  return { count, rows };
}
