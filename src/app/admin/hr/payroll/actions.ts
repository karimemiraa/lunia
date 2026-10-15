"use server";

// Payroll actions (hr:manage). The module enforces the DRAFT -> APPROVED ->
// PAID workflow; these only authorize, audit and revalidate.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import {
  PayrollError,
  approvePayrollRun,
  createPayrollRun,
  deleteDraftRun,
  markPayrollRunPaid,
  recalculatePayrollRun,
  updatePayslip,
} from "@/modules/hr/payroll";
import type { FormState } from "../_components/ActionForm";
import { translateError } from "../_components/errors";
import { getStaffT } from "../../_i18n/display";
import type { T } from "../../_i18n/t";

function fail(t: T, err: unknown): FormState {
  if (err instanceof PayrollError) return { error: translateError(t, err.message) };
  console.error("[payroll action]", err);
  return { error: t("Something went wrong.") };
}

function refresh(runId?: string) {
  revalidatePath("/admin/hr/payroll");
  if (runId) revalidatePath(`/admin/hr/payroll/${runId}`);
}

export async function createRunAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin(PERMISSIONS.HR_MANAGE);
  const t = await getStaffT();
  const month = String(formData.get("month") ?? "");
  let id: string;
  try {
    ({ id } = await createPayrollRun(month, admin.id));
  } catch (err) {
    return fail(t, err);
  }
  await recordAudit({ actorUserId: admin.id, action: "HR_PAYROLL_CREATE", entityType: "PayrollRun", entityId: id, summary: `Created payroll run ${month}` });
  refresh();
  redirect(`/admin/hr/payroll/${id}`);
}

export async function recalculateRunAction(runId: string): Promise<FormState> {
  const admin = await requireAdmin(PERMISSIONS.HR_MANAGE);
  const t = await getStaffT();
  try {
    await recalculatePayrollRun(runId);
  } catch (err) {
    return fail(t, err);
  }
  await recordAudit({ actorUserId: admin.id, action: "HR_PAYROLL_RECALC", entityType: "PayrollRun", entityId: runId, summary: `Recalculated payroll run ${runId}` });
  refresh(runId);
  return { success: t("Recalculated from current employee files.") };
}

export async function updatePayslipAction(runId: string, payslipId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin(PERMISSIONS.HR_MANAGE);
  const t = await getStaffT();
  const input = {
    overtime: String(formData.get("overtime") ?? ""),
    bonus: String(formData.get("bonus") ?? ""),
    deductions: String(formData.get("deductions") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
  try {
    await updatePayslip(payslipId, input);
  } catch (err) {
    return fail(t, err);
  }
  await recordAudit({
    actorUserId: admin.id,
    action: "HR_PAYSLIP_EDIT",
    entityType: "Payslip",
    entityId: payslipId,
    summary: `Edited payslip ${payslipId}: overtime ${input.overtime || 0}, bonus ${input.bonus || 0}, deductions ${input.deductions || 0}`,
  });
  refresh(runId);
  return { success: t("Saved.") };
}

export async function approveRunAction(runId: string): Promise<FormState> {
  const admin = await requireAdmin(PERMISSIONS.HR_MANAGE);
  const t = await getStaffT();
  try {
    await approvePayrollRun(runId, admin.id);
  } catch (err) {
    return fail(t, err);
  }
  await recordAudit({ actorUserId: admin.id, action: "HR_PAYROLL_APPROVE", entityType: "PayrollRun", entityId: runId, summary: `Approved payroll run ${runId}` });
  refresh(runId);
  return { success: t("Approved and locked.") };
}

export async function markPaidAction(runId: string): Promise<FormState> {
  const admin = await requireAdmin(PERMISSIONS.HR_MANAGE);
  const t = await getStaffT();
  try {
    await markPayrollRunPaid(runId);
  } catch (err) {
    return fail(t, err);
  }
  await recordAudit({ actorUserId: admin.id, action: "HR_PAYROLL_PAID", entityType: "PayrollRun", entityId: runId, summary: `Marked payroll run ${runId} as paid` });
  refresh(runId);
  return { success: t("Marked as paid.") };
}

export async function deleteRunAction(runId: string): Promise<FormState> {
  const admin = await requireAdmin(PERMISSIONS.HR_MANAGE);
  const t = await getStaffT();
  try {
    await deleteDraftRun(runId);
  } catch (err) {
    return fail(t, err);
  }
  await recordAudit({ actorUserId: admin.id, action: "HR_PAYROLL_DELETE", entityType: "PayrollRun", entityId: runId, summary: `Deleted draft payroll run ${runId}` });
  refresh();
  redirect("/admin/hr/payroll");
}
