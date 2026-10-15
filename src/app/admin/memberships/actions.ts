"use server";

// Memberships admin actions. Managing members (enrol, pause, cancel, resend)
// needs billing:manage — they create invoices. Creating/editing plans (prices,
// discounts) needs settings:manage. Every action is audited.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import { prisma } from "@/lib/db";
import { cancel, createPlan, deliverMembershipInvoice, enrol, keep, pause, resume, updatePlan, type PlanInput } from "@/modules/memberships/memberships";
import { getStaffLocale, getStaffT } from "../_i18n/display";
import { intlLocale, type T } from "../_i18n/t";

export type MembershipActionResult = { ok: true; message?: string } | { ok: false; error: string };

function fail(t: T, err: unknown, fallback: string): MembershipActionResult {
  if (err && typeof err === "object" && "issues" in err) {
    const issue = (err as { issues: { message: string }[] }).issues[0];
    return { ok: false, error: t(issue?.message ?? fallback) };
  }
  return { ok: false, error: t(err instanceof Error && err.message ? err.message : fallback) };
}

function refresh(clientProfileId?: string) {
  revalidatePath("/admin/memberships");
  if (clientProfileId) revalidatePath(`/admin/clients/${clientProfileId}`);
}

export async function savePlanAction(planId: string | null, input: PlanInput): Promise<MembershipActionResult> {
  const admin = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  const t = await getStaffT();
  try {
    const plan = planId ? await updatePlan(planId, input) : await createPlan(input);
    await recordAudit({
      actorUserId: admin.id,
      action: planId ? "membership.plan.update" : "membership.plan.create",
      entityType: "MembershipPlan",
      entityId: plan.id,
      summary: `${planId ? "Updated" : "Created"} membership plan "${plan.nameEn}" (${(plan.priceMinor / 100).toFixed(2)} SAR/month, ${plan.serviceDiscountPct}% services, ${plan.includedSessions} session(s)${plan.isActive ? "" : ", not offered"})`,
    });
  } catch (err) {
    return fail(t, err, "Couldn't save the plan.");
  }
  refresh();
  return { ok: true };
}

export async function enrolAction(input: { clientProfileId: string; planId: string; startDate?: string }): Promise<MembershipActionResult> {
  const admin = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  const t = await getStaffT();
  try {
    const startAt = input.startDate ? new Date(`${input.startDate}T06:00:00Z`) : undefined; // 09:00 Riyadh
    if (startAt && Number.isNaN(startAt.getTime())) return { ok: false, error: t("Invalid start date.") };
    const { subscription, cycle } = await enrol({ clientProfileId: input.clientProfileId, planId: input.planId, startAt }, admin.id);
    const plan = await prisma.membershipPlan.findUnique({ where: { id: input.planId } });
    await recordAudit({ actorUserId: admin.id, action: "membership.enrol", entityType: "MembershipSubscription", entityId: subscription.id, summary: `Enrolled customer ${input.clientProfileId} in "${plan?.nameEn}" (first invoice ${cycle.invoiceId})` });
    refresh(input.clientProfileId);
    return { ok: true, message: t("Enrolled — the first month's invoice was sent to the customer.") };
  } catch (err) {
    return fail(t, err, "Couldn't enrol the customer.");
  }
}

type SubAction = "pause" | "resume" | "cancel" | "cancelNow" | "keep" | "resend";

export async function subscriptionAction(subscriptionId: string, action: SubAction): Promise<MembershipActionResult> {
  const admin = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  const [t, locale] = await Promise.all([getStaffT(), getStaffLocale()]);
  const sub = await prisma.membershipSubscription.findUnique({ where: { id: subscriptionId }, include: { cycles: { orderBy: { periodStart: "desc" }, take: 1 } } });
  if (!sub) return { ok: false, error: t("Membership not found.") };
  let message = t("Done.");
  try {
    switch (action) {
      case "pause":
        await pause(subscriptionId);
        message = t("Paused — no new invoices until it's resumed.");
        break;
      case "resume":
        await resume(subscriptionId, admin.id);
        message = t("Resumed — a new month starts today and its invoice was sent.");
        break;
      case "cancel": {
        const r = await cancel(subscriptionId);
        message = r.cancelAt ? t("Will end on {date}.", { date: new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric" }).format(r.cancelAt) }) : t("Cancellation scheduled.");
        break;
      }
      case "cancelNow":
        await cancel(subscriptionId, { immediately: true });
        message = t("Cancelled now.");
        break;
      case "keep":
        await keep(subscriptionId);
        message = t("Cancellation withdrawn.");
        break;
      case "resend": {
        const invoiceId = sub.cycles[0]?.invoiceId;
        if (!invoiceId) return { ok: false, error: t("No invoice to send.") };
        const r = await deliverMembershipInvoice(invoiceId);
        if (!r.ok) return { ok: false, error: t(r.error ?? "Couldn't send the invoice.") };
        message = t("Invoice sent again.");
        break;
      }
    }
    await recordAudit({ actorUserId: admin.id, action: `membership.${action}`, entityType: "MembershipSubscription", entityId: subscriptionId, summary: `Membership ${action} for customer ${sub.clientProfileId}` });
  } catch (err) {
    return fail(t, err, "Couldn't update the membership.");
  }
  refresh(sub.clientProfileId);
  return { ok: true, message };
}
