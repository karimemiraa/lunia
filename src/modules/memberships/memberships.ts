// Paid memberships: monthly plans billed by invoice + pay link.
//
// Lifecycle
//   enrol     → subscription ACTIVE, month 1 invoiced and sent (pay link when
//               online payments are configured; otherwise pay at the desk).
//   paid      → benefits on (onMembershipInvoicePaid, inside the payment tx):
//               plan discount at checkout + included sessions as a package
//               purchase that expires with the month (no roll-over).
//   each day  → runMembershipBilling(): invoice the next month when the current
//               one ends, end scheduled cancellations, and mark subscriptions
//               PAST_DUE when a month stays unpaid past the plan's grace days.
//   pause / resume / cancel (cancel honours the minimum term unless "now").
// The worker never charges a card: Lunia only has pay-by-link.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { createDraft, issueInvoice } from "@/modules/billing/invoices";
import { getTaxSettings } from "@/modules/billing/settings";
import { sendInvoice } from "@/modules/billing/delivery";
import { onlinePaymentsConfigured } from "@/modules/billing/payments/links";

export const SUBSCRIPTION_STATUSES = ["ACTIVE", "PAST_DUE", "PAUSED", "CANCELLED"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
const LIVE: SubscriptionStatus[] = ["ACTIVE", "PAST_DUE", "PAUSED"];
const DAY_MS = 86_400_000;

/** Same day-of-month `n` months later (clamped: Jan 31 + 1 → Feb 28/29). */
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + n);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

/**
 * The end of the month that starts at `start`, counted from the billing
 * anchor so short months don't drag every later renewal to the 28th
 * (Jan 31 → Feb 28 → Mar 31, not Mar 28).
 */
export function nextPeriodEnd(anchor: Date, start: Date): Date {
  let k = 1;
  while (addMonths(anchor, k).getTime() <= start.getTime()) k += 1;
  return addMonths(anchor, k);
}

const fmtDay = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric" }).format(d);

// ---- Plans --------------------------------------------------------------------

export const planSchema = z.object({
  nameEn: z.string().trim().min(1, "English name is required.").max(80),
  nameAr: z.string().trim().min(1, "Arabic name is required.").max(80),
  descriptionEn: z.string().trim().max(500).default(""),
  descriptionAr: z.string().trim().max(500).default(""),
  priceMinor: z.number().int().nonnegative().max(100_000_000),
  serviceDiscountPct: z.number().int().min(0).max(100).default(0),
  productDiscountPct: z.number().int().min(0).max(100).default(0),
  includedSessions: z.number().int().min(0).max(50).default(0),
  includedServiceId: z.string().min(1).nullable().optional(),
  minTermMonths: z.number().int().min(1).max(36).default(1),
  graceDays: z.number().int().min(0).max(30).default(7),
  isActive: z.boolean().default(true),
});
export type PlanInput = z.input<typeof planSchema>;

// The included sessions are credited through the package system so the desk
// redeems them exactly like a prepaid package. One hidden package per plan.
async function syncSessionPackage(planId: string) {
  const plan = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: planId } });
  const data = {
    nameEn: `${plan.nameEn} — monthly sessions`,
    nameAr: `${plan.nameAr} — جلسات الشهر`,
    serviceId: plan.includedServiceId ?? null,
    sessionsTotal: Math.max(1, plan.includedSessions),
    priceMinor: 0,
    isActive: false, // never sold on its own
  };
  if (plan.sessionPackageId) {
    await prisma.servicePackage.update({ where: { id: plan.sessionPackageId }, data });
  } else if (plan.includedSessions > 0) {
    const pkg = await prisma.servicePackage.create({ data });
    await prisma.membershipPlan.update({ where: { id: plan.id }, data: { sessionPackageId: pkg.id } });
  }
}

export async function createPlan(input: PlanInput) {
  const data = planSchema.parse(input);
  const plan = await prisma.membershipPlan.create({ data: { ...data, includedServiceId: data.includedServiceId ?? null } });
  await syncSessionPackage(plan.id);
  return prisma.membershipPlan.findUniqueOrThrow({ where: { id: plan.id } });
}

/** Edits apply to future months; current subscribers keep their price until then. */
export async function updatePlan(planId: string, input: PlanInput) {
  const data = planSchema.parse(input);
  await prisma.membershipPlan.update({ where: { id: planId }, data: { ...data, includedServiceId: data.includedServiceId ?? null } });
  await syncSessionPackage(planId);
  return prisma.membershipPlan.findUniqueOrThrow({ where: { id: planId } });
}

export async function listPlans(filter: { activeOnly?: boolean } = {}) {
  return prisma.membershipPlan.findMany({
    where: filter.activeOnly ? { isActive: true } : {},
    orderBy: [{ isActive: "desc" }, { priceMinor: "asc" }],
    include: { _count: { select: { subscriptions: { where: { status: { in: LIVE } } } } } },
  });
}

// ---- Billing a month -----------------------------------------------------------

async function invoiceMonth(subscriptionId: string, periodStart: Date, periodEnd: Date, actorId?: string) {
  const sub = await prisma.membershipSubscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    include: { plan: true },
  });
  const client = await prisma.clientProfile.findUniqueOrThrow({ where: { id: sub.clientProfileId }, include: { user: true } });
  const tax = await getTaxSettings();
  const draft = await createDraft(
    {
      clientProfileId: client.id,
      customerName: client.fullName,
      customerPhone: client.user.phone,
      pricesIncludeVat: tax.pricesIncludeVat,
      notes: `Membership ${sub.plan.nameEn}: ${fmtDay(periodStart)} – ${fmtDay(new Date(periodEnd.getTime() - 1))}`,
      lines: [
        {
          kind: "OTHER",
          description: `Membership — ${sub.plan.nameEn} (${fmtDay(periodStart)} – ${fmtDay(new Date(periodEnd.getTime() - 1))})`,
          qty: 1,
          unitPriceMinor: sub.plan.priceMinor,
          vatRateBp: tax.defaultVatRateBp,
        },
      ],
    },
    actorId,
  );
  // The cycle row exists BEFORE issuing so a zero-price month (settled PAID
  // while issuing) still finds it in the paid hook.
  const cycle = await prisma.membershipCycle.create({ data: { subscriptionId, periodStart, periodEnd, invoiceId: draft.id } });
  await issueInvoice(draft.id, { actorId });
  return cycle;
}

/** Best-effort: send the month's invoice with a pay link (WhatsApp/SMS → email fallback). */
export async function deliverMembershipInvoice(invoiceId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { client: { include: { user: true } } } });
    if (inv.status === "PAID") return { ok: true };
    const includePayLink = await onlinePaymentsConfigured();
    const channel = inv.customerPhone || inv.client?.user.phone ? "whatsapp" : "email";
    const res = await sendInvoice(invoiceId, { channel, includePayLink });
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not send" };
  }
}

// ---- Subscriptions ------------------------------------------------------------

export class MembershipError extends Error {}

export async function enrol(input: { clientProfileId: string; planId: string; startAt?: Date }, actorId?: string, opts: { send?: boolean } = {}) {
  const plan = await prisma.membershipPlan.findUnique({ where: { id: input.planId } });
  if (!plan || !plan.isActive) throw new MembershipError("This plan isn't available.");
  const existing = await prisma.membershipSubscription.findFirst({ where: { clientProfileId: input.clientProfileId, status: { in: LIVE } } });
  if (existing) throw new MembershipError("This customer already has a membership. Cancel it first to switch plans.");
  const start = input.startAt ?? new Date();
  const end = addMonths(start, 1);
  const sub = await prisma.membershipSubscription.create({
    data: {
      clientProfileId: input.clientProfileId,
      planId: plan.id,
      status: "ACTIVE",
      startedAt: start,
      currentPeriodStart: start,
      currentPeriodEnd: end,
      billingAnchorAt: start,
      minTermEndsAt: addMonths(start, plan.minTermMonths),
      createdById: actorId ?? null,
    },
  });
  let cycle;
  try {
    cycle = await invoiceMonth(sub.id, start, end, actorId);
  } catch (err) {
    // e.g. incomplete tax settings: don't leave a membership without its invoice.
    await prisma.membershipSubscription.delete({ where: { id: sub.id } });
    throw err;
  }
  if (opts.send !== false) await deliverMembershipInvoice(cycle.invoiceId!);
  return { subscription: sub, cycle };
}

export async function pause(subscriptionId: string, now: Date = new Date()) {
  const sub = await prisma.membershipSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
  if (sub.status !== "ACTIVE" && sub.status !== "PAST_DUE") throw new MembershipError("Only an active membership can be paused.");
  return prisma.membershipSubscription.update({ where: { id: subscriptionId }, data: { status: "PAUSED", pausedAt: now } });
}

/** Resumes billing from today: a fresh month starts (and is invoiced) now. */
export async function resume(subscriptionId: string, actorId?: string, now: Date = new Date(), opts: { send?: boolean } = {}) {
  const sub = await prisma.membershipSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
  if (sub.status !== "PAUSED") throw new MembershipError("Only a paused membership can be resumed.");
  const end = addMonths(now, 1);
  await prisma.membershipSubscription.update({
    where: { id: subscriptionId },
    data: { status: "ACTIVE", pausedAt: null, currentPeriodStart: now, currentPeriodEnd: end, billingAnchorAt: now },
  });
  const cycle = await invoiceMonth(subscriptionId, now, end, actorId);
  if (opts.send !== false) await deliverMembershipInvoice(cycle.invoiceId!);
  return cycle;
}

/**
 * Cancels. By default it ends when the current paid month ends, or at the end
 * of the minimum term if that's later (months until then are still billed).
 * `immediately` ends it now (staff override; unpaid invoices stay open).
 */
export async function cancel(subscriptionId: string, opts: { immediately?: boolean } = {}, now: Date = new Date()) {
  const sub = await prisma.membershipSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
  if (sub.status === "CANCELLED") return sub;
  if (opts.immediately) {
    return prisma.membershipSubscription.update({ where: { id: subscriptionId }, data: { status: "CANCELLED", cancelAt: now, cancelledAt: now } });
  }
  const cancelAt = sub.minTermEndsAt > sub.currentPeriodEnd ? sub.minTermEndsAt : sub.currentPeriodEnd;
  return prisma.membershipSubscription.update({ where: { id: subscriptionId }, data: { cancelAt } });
}

/** Undo a scheduled cancellation. */
export async function keep(subscriptionId: string) {
  return prisma.membershipSubscription.update({ where: { id: subscriptionId, status: { in: ["ACTIVE", "PAST_DUE", "PAUSED"] } }, data: { cancelAt: null } });
}

/**
 * The daily billing run (worker job "membership-billing"). Safe to re-run:
 * a month is created at most once (unique subscription + periodStart).
 */
export async function runMembershipBilling(now: Date = new Date(), opts: { send?: boolean } = {}) {
  let invoiced = 0;
  let ended = 0;
  let pastDue = 0;

  const due = await prisma.membershipSubscription.findMany({ where: { status: { in: ["ACTIVE", "PAST_DUE"] }, currentPeriodEnd: { lte: now } } });
  for (const sub of due) {
    if (sub.cancelAt && sub.cancelAt <= sub.currentPeriodEnd) {
      await prisma.membershipSubscription.update({ where: { id: sub.id }, data: { status: "CANCELLED", cancelledAt: sub.currentPeriodEnd } });
      ended += 1;
      continue;
    }
    const start = sub.currentPeriodEnd;
    const end = nextPeriodEnd(sub.billingAnchorAt ?? sub.startedAt, start);
    const claimed = await prisma.membershipSubscription.updateMany({
      where: { id: sub.id, currentPeriodEnd: sub.currentPeriodEnd },
      data: { currentPeriodStart: start, currentPeriodEnd: end },
    });
    if (claimed.count !== 1) continue; // another replica got it
    let cycle;
    try {
      cycle = await invoiceMonth(sub.id, start, end);
    } catch (err) {
      // Roll the period back so tomorrow's run retries this month.
      await prisma.membershipSubscription.update({ where: { id: sub.id }, data: { currentPeriodStart: sub.currentPeriodStart, currentPeriodEnd: sub.currentPeriodEnd } });
      console.error(`[memberships] could not invoice subscription ${sub.id}`, err);
      continue;
    }
    if (opts.send !== false) await deliverMembershipInvoice(cycle.invoiceId!);
    invoiced += 1;
  }

  // Unpaid past the grace period → benefits off until paid.
  const unpaid = await prisma.membershipCycle.findMany({
    where: { status: "DUE", subscription: { status: "ACTIVE" } },
    include: { subscription: { include: { plan: true } } },
  });
  for (const c of unpaid) {
    if (c.periodStart.getTime() + c.subscription.plan.graceDays * DAY_MS <= now.getTime()) {
      const r = await prisma.membershipSubscription.updateMany({ where: { id: c.subscriptionId, status: "ACTIVE" }, data: { status: "PAST_DUE" } });
      pastDue += r.count;
    }
  }
  return { invoiced, ended, pastDue };
}

// ---- Reads ----------------------------------------------------------------------

export async function listSubscriptions(filter: { status?: SubscriptionStatus | "LIVE" } = {}) {
  const where = !filter.status ? {} : filter.status === "LIVE" ? { status: { in: LIVE } } : { status: filter.status };
  return prisma.membershipSubscription.findMany({
    where,
    orderBy: [{ status: "asc" }, { currentPeriodEnd: "asc" }],
    include: {
      plan: { select: { id: true, nameEn: true, priceMinor: true } },
      cycles: { orderBy: { periodStart: "desc" }, take: 1 },
    },
    take: 500,
  });
}

/** The customer's current (not cancelled) membership with its latest month. */
export async function getClientMembership(clientProfileId: string) {
  return prisma.membershipSubscription.findFirst({
    where: { clientProfileId, status: { in: LIVE } },
    include: { plan: true, cycles: { orderBy: { periodStart: "desc" }, take: 3 } },
  });
}

export async function membershipStats() {
  const [active, pastDue, paused, mrr] = await Promise.all([
    prisma.membershipSubscription.count({ where: { status: "ACTIVE" } }),
    prisma.membershipSubscription.count({ where: { status: "PAST_DUE" } }),
    prisma.membershipSubscription.count({ where: { status: "PAUSED" } }),
    prisma.membershipSubscription.findMany({ where: { status: { in: ["ACTIVE", "PAST_DUE"] } }, select: { plan: { select: { priceMinor: true } } } }),
  ]);
  return { active, pastDue, paused, monthlyRevenueMinor: mrr.reduce((s, r) => s + r.plan.priceMinor, 0) };
}
