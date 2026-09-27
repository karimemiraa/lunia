"use server";

// Employee-file actions. Every action re-checks hr:manage itself.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import { saveEmployeeRecord, type EmployeeRecordInput } from "@/modules/hr/employees";
import type { FormState } from "./_components/ActionForm";

const FIELDS = [
  "employeeNo", "nationality", "isSaudi", "nationalId", "nationalIdExpiry", "passportNo", "passportExpiry",
  "jobTitle", "department", "hireDate", "contractType", "contractEnd", "basicSalaryMinor", "housingAllowanceMinor",
  "transportAllowanceMinor", "otherAllowanceMinor", "commissionPct", "gosiApplicable", "iban", "bankName",
  "annualLeaveDays", "emergencyContact", "notes",
] as const;

export async function saveEmployeeAction(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin(PERMISSIONS.HR_MANAGE);
  const input: Record<string, string> = {};
  for (const key of FIELDS) {
    const value = formData.get(key);
    if (typeof value === "string") input[key] = value;
  }
  const result = await saveEmployeeRecord(userId, input as EmployeeRecordInput);
  if (!result.ok) return { error: result.error };

  // Pay and identity data are sensitive: log who changed a file (not the values).
  await recordAudit({
    actorUserId: admin.id,
    action: "HR_EMPLOYEE_SAVE",
    entityType: "EmployeeRecord",
    entityId: userId,
    summary: `Updated employee file for user ${userId}`,
  });
  revalidatePath("/admin/hr");
  revalidatePath(`/admin/hr/${userId}`);
  return { success: "Saved." };
}
