import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { recordPayment } from "@/modules/billing/settlement";
import { createDraft } from "@/modules/billing/invoices";
import { redeemablePackages } from "@/modules/billing/lookup";
import { activeMemberBenefits } from "@/modules/memberships/benefits";
import { addMonths, cancel, createPlan, enrol, keep, membershipStats, pause, resume, runMembershipBilling } from "@/modules/memberships/memberships";
import { setupBilling, teardownBilling, makeClient, makeService } from "../billing/fixtures";

// Paid memberships end to end against real billing: enrol → invoice issued →
// paid → benefits (discount + sessions) → monthly renewal → grace / past due
// → pause / resume → cancellation honouring the minimum term.

const TAG = "TESTMEMBER";
const planIds: string[] = [];
const clients: string[] = [];

const pay = (invoiceId: string, amountMinor: number) => recordPayment({ invoiceId, method: "CARD", amountMinor, reference: `${TAG}-pay` });
const invoiceOf = async (subscriptionId: string, periodStart: Date) =>
  prisma.invoice.findUniqueOrThrow({ where: { id: (await prisma.membershipCycle.findUniqueOrThrow({ where: { subscriptionId_periodStart: { subscriptionId, periodStart } } })).invoiceId! } });

beforeAll(async () => {
  await setupBilling();
});

afterAll(async () => {
  const subs = await prisma.membershipSubscription.findMany({ where: { clientProfileId: { in: clients } }, select: { id: true } });
  await prisma.membershipCycle.deleteMany({ where: { subscriptionId: { in: subs.map((s) => s.id) } } });
  await prisma.membershipSubscription.deleteMany({ where: { clientProfileId: { in: clients } } });
  const plans = await prisma.membershipPlan.findMany({ where: { id: { in: planIds } } });
  await prisma.membershipPlan.deleteMany({ where: { id: { in: planIds } } });
  await prisma.packagePurchase.deleteMany({ where: { clientProfileId: { in: clients } } });
  await prisma.servicePackage.deleteMany({ where: { id: { in: plans.map((p) => p.sessionPackageId).filter((x): x is string => !!x) } } });
  await teardownBilling();
});

async function newPlan(extra: Partial<Parameters<typeof createPlan>[0]> = {}) {
  const plan = await createPlan({ nameEn: `${TAG} Gold`, nameAr: "ذهبي", priceMinor: 49_900, serviceDiscountPct: 10, productDiscountPct: 5, includedSessions: 1, minTermMonths: 3, graceDays: 7, ...extra });
  planIds.push(plan.id);
  return plan;
}
async function newClient() {
  const c = await makeClient(`${TAG} Member`);
  clients.push(c.profileId);
  return c.profileId;
}

describe("memberships", () => {
  it("monthly lifecycle: invoice → paid → benefits → renewal", async () => {
    const plan = await newPlan();
    expect(plan.sessionPackageId).toBeTruthy();
    expect((await prisma.servicePackage.findUniqueOrThrow({ where: { id: plan.sessionPackageId! } })).isActive).toBe(false); // never sold on its own

    const clientId = await newClient();
    const start = new Date("2026-11-01T09:00:00Z");
    const { subscription, cycle } = await enrol({ clientProfileId: clientId, planId: plan.id, startAt: start }, undefined, { send: false });
    expect(subscription.currentPeriodEnd.toISOString()).toBe("2026-12-01T09:00:00.000Z");
    expect(subscription.minTermEndsAt.toISOString()).toBe("2027-02-01T09:00:00.000Z");

    const inv = await invoiceOf(subscription.id, start);
    expect(inv.status).toBe("ISSUED");
    expect(inv.totalMinor).toBe(49_900);
    // Unpaid month: no benefits yet.
    expect(await activeMemberBenefits(clientId, new Date("2026-11-02T00:00:00Z"))).toBeNull();

    await pay(inv.id, inv.totalMinor);
    const paidCycle = await prisma.membershipCycle.findUniqueOrThrow({ where: { id: cycle.id } });
    expect(paidCycle.status).toBe("PAID");
    // Included session credited, valid until the month ends.
    const credit = await prisma.packagePurchase.findUniqueOrThrow({ where: { id: paidCycle.packagePurchaseId! } });
    expect(credit.sessionsRemaining).toBe(1);
    expect(credit.expiresAt?.toISOString()).toBe("2026-12-01T09:00:00.000Z");
    expect((await redeemablePackages(clientId)).map((p) => p.id)).toContain(credit.id);

    const benefits = await activeMemberBenefits(clientId, new Date("2026-11-10T00:00:00Z"));
    expect(benefits).toMatchObject({ planName: `${TAG} Gold`, serviceDiscountPct: 10, productDiscountPct: 5 });

    // Renewal: the next month is invoiced once, however often the job runs.
    const next = new Date("2026-12-01T10:00:00Z");
    expect(await runMembershipBilling(next, { send: false })).toMatchObject({ invoiced: 1 });
    expect(await runMembershipBilling(next, { send: false })).toMatchObject({ invoiced: 0 });
    const dec = await invoiceOf(subscription.id, new Date("2026-12-01T09:00:00Z"));
    expect(dec.status).toBe("ISSUED");
  });

  it("member discount is applied to service and product lines at checkout, not to other lines", async () => {
    const plan = await newPlan({ includedSessions: 0 });
    const clientId = await newClient();
    // Starts now so benefits apply to a draft created now.
    const { subscription } = await enrol({ clientProfileId: clientId, planId: plan.id }, undefined, { send: false });
    const first = await prisma.membershipCycle.findFirstOrThrow({ where: { subscriptionId: subscription.id } });
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: first.invoiceId! } });
    await pay(inv.id, inv.totalMinor);

    const service = await makeService(20_000);
    const draft = await createDraft({
      clientProfileId: clientId,
      pricesIncludeVat: true,
      lines: [
        { kind: "SERVICE", serviceId: service.id, description: "Facial", qty: 1, unitPriceMinor: 20_000, vatRateBp: 1500 },
        { kind: "PRODUCT", description: "Serum", qty: 2, unitPriceMinor: 10_000, vatRateBp: 1500 },
        { kind: "OTHER", description: "Consultation", qty: 1, unitPriceMinor: 5_000, vatRateBp: 1500 },
        { kind: "SERVICE", serviceId: service.id, description: "Already discounted", qty: 1, unitPriceMinor: 20_000, discountMinor: 1_000, vatRateBp: 1500 },
      ],
    });
    const lines = await prisma.invoiceLine.findMany({ where: { invoiceId: draft.id }, orderBy: { sortOrder: "asc" } });
    // 10% on services, 5% on products; untouched OTHER line and manual discount kept.
    expect(lines[0]!.totalMinor).toBe(18_000);
    expect(lines[1]!.totalMinor).toBe(19_000);
    expect(lines[2]!.totalMinor).toBe(5_000);
    expect(lines[3]!.totalMinor).toBe(19_000);
    expect(draft.notes).toContain(`Member discount: ${TAG} Gold`);
  });

  it("unpaid past the grace period → past due (benefits off) until paid", async () => {
    const plan = await newPlan({ graceDays: 5 });
    const clientId = await newClient();
    const start = new Date("2026-11-01T09:00:00Z");
    const { subscription } = await enrol({ clientProfileId: clientId, planId: plan.id, startAt: start }, undefined, { send: false });
    expect(await runMembershipBilling(new Date("2026-11-05T09:00:00Z"), { send: false })).toMatchObject({ pastDue: 0 });
    expect(await runMembershipBilling(new Date("2026-11-06T10:00:00Z"), { send: false })).toMatchObject({ pastDue: 1 });
    expect((await prisma.membershipSubscription.findUniqueOrThrow({ where: { id: subscription.id } })).status).toBe("PAST_DUE");

    const inv = await invoiceOf(subscription.id, start);
    await pay(inv.id, inv.totalMinor);
    expect((await prisma.membershipSubscription.findUniqueOrThrow({ where: { id: subscription.id } })).status).toBe("ACTIVE");
  });

  it("cancellation honours the minimum term; 'keep' undoes it; immediate cancel ends now", async () => {
    const plan = await newPlan({ minTermMonths: 3, includedSessions: 0 });
    const clientId = await newClient();
    const start = new Date("2026-11-01T09:00:00Z");
    const { subscription } = await enrol({ clientProfileId: clientId, planId: plan.id, startAt: start }, undefined, { send: false });

    const scheduled = await cancel(subscription.id);
    expect(scheduled.cancelAt?.toISOString()).toBe(addMonths(start, 3).toISOString());
    await keep(subscription.id);
    expect((await prisma.membershipSubscription.findUniqueOrThrow({ where: { id: subscription.id } })).cancelAt).toBeNull();
    await cancel(subscription.id);

    // Months inside the minimum term are still billed…
    await runMembershipBilling(new Date("2026-12-01T10:00:00Z"), { send: false });
    await runMembershipBilling(new Date("2027-01-01T10:00:00Z"), { send: false });
    expect(await prisma.membershipCycle.count({ where: { subscriptionId: subscription.id } })).toBe(3);
    // …and it ends when the term is over, without a 4th invoice.
    await runMembershipBilling(new Date("2027-02-01T10:00:00Z"), { send: false });
    expect((await prisma.membershipSubscription.findUniqueOrThrow({ where: { id: subscription.id } })).status).toBe("CANCELLED");
    expect(await prisma.membershipCycle.count({ where: { subscriptionId: subscription.id } })).toBe(3);

    // Immediate cancel (staff override).
    const other = await newClient();
    const s2 = (await enrol({ clientProfileId: other, planId: plan.id }, undefined, { send: false })).subscription;
    expect((await cancel(s2.id, { immediately: true })).status).toBe("CANCELLED");
  });

  it("pause stops billing; resume starts a fresh month; one membership per customer", async () => {
    const plan = await newPlan({ includedSessions: 0 });
    const clientId = await newClient();
    const start = new Date("2026-11-01T09:00:00Z");
    const { subscription } = await enrol({ clientProfileId: clientId, planId: plan.id, startAt: start }, undefined, { send: false });
    await expect(enrol({ clientProfileId: clientId, planId: plan.id }, undefined, { send: false })).rejects.toThrow(/already has a membership/);

    await pause(subscription.id, new Date("2026-11-10T09:00:00Z"));
    await runMembershipBilling(new Date("2026-12-02T09:00:00Z"), { send: false });
    expect(await prisma.membershipCycle.count({ where: { subscriptionId: subscription.id } })).toBe(1);
    const resumeAt = new Date("2027-01-15T09:00:00Z");
    await resume(subscription.id, undefined, resumeAt, { send: false });
    const after = await prisma.membershipSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(after.status).toBe("ACTIVE");
    expect(after.currentPeriodEnd.toISOString()).toBe("2027-02-15T09:00:00.000Z");
    expect(await prisma.membershipCycle.count({ where: { subscriptionId: subscription.id } })).toBe(2);

    const stats = await membershipStats();
    expect(stats.active).toBeGreaterThanOrEqual(1);
  });

  it("addMonths clamps to the end of shorter months", () => {
    expect(addMonths(new Date("2027-01-31T09:00:00Z"), 1).toISOString()).toBe("2027-02-28T09:00:00.000Z");
    expect(addMonths(new Date("2028-01-31T09:00:00Z"), 1).toISOString()).toBe("2028-02-29T09:00:00.000Z");
  });
});
