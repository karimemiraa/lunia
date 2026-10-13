// Member benefits lookup (DB-only, no billing imports) so billing can apply
// the member discount without an import cycle. Benefits apply only while the
// subscription is ACTIVE and the month covering `now` has been PAID.

import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

type Db = typeof prisma | Prisma.TransactionClient;

export interface MemberBenefits {
  subscriptionId: string;
  planName: string;
  serviceDiscountPct: number;
  productDiscountPct: number;
}

export async function activeMemberBenefits(clientProfileId: string, now: Date = new Date(), db: Db = prisma): Promise<MemberBenefits | null> {
  const sub = await db.membershipSubscription.findFirst({
    where: {
      clientProfileId,
      status: "ACTIVE",
      cycles: { some: { status: "PAID", periodStart: { lte: now }, periodEnd: { gt: now } } },
    },
    include: { plan: true },
  });
  if (!sub) return null;
  return {
    subscriptionId: sub.id,
    planName: sub.plan.nameEn,
    serviceDiscountPct: sub.plan.serviceDiscountPct,
    productDiscountPct: sub.plan.productDiscountPct,
  };
}

/** Line discount (same VAT basis as the price) for a member, or 0. */
export function memberLineDiscount(kind: string, unitPriceMinor: number, qty: number, b: MemberBenefits | null): number {
  if (!b) return 0;
  const pct = kind === "SERVICE" ? b.serviceDiscountPct : kind === "PRODUCT" ? b.productDiscountPct : 0;
  return pct > 0 ? Math.round((unitPriceMinor * qty * pct) / 100) : 0;
}

/**
 * Called inside the payment transaction when an invoice becomes PAID: marks
 * the membership month paid, credits its included sessions (a package
 * purchase valid until the month ends) and lifts a past-due status.
 * DB-only on purpose — it runs within settleInvoice's transaction.
 */
export async function onMembershipInvoicePaid(tx: Prisma.TransactionClient, invoiceId: string, now: Date = new Date()): Promise<void> {
  const cycle = await tx.membershipCycle.findUnique({ where: { invoiceId }, include: { subscription: { include: { plan: true } } } });
  if (!cycle || cycle.status !== "DUE") return;
  const plan = cycle.subscription.plan;
  let packagePurchaseId: string | null = null;
  if (plan.includedSessions > 0 && plan.sessionPackageId && cycle.periodEnd > now) {
    const purchase = await tx.packagePurchase.create({
      data: {
        clientProfileId: cycle.subscription.clientProfileId,
        packageId: plan.sessionPackageId,
        sessionsRemaining: plan.includedSessions,
        status: "ACTIVE",
        expiresAt: cycle.periodEnd,
      },
    });
    packagePurchaseId = purchase.id;
  }
  await tx.membershipCycle.update({ where: { id: cycle.id }, data: { status: "PAID", paidAt: now, packagePurchaseId } });
  if (cycle.subscription.status === "PAST_DUE") {
    await tx.membershipSubscription.update({ where: { id: cycle.subscriptionId }, data: { status: "ACTIVE" } });
  }
}
