"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import { decideLeave } from "@/modules/hr/leave";
import type { FormState } from "../_components/ActionForm";

export async function decideLeaveAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin(PERMISSIONS.HR_MANAGE);
  const decision = formData.get("decision") === "APPROVED" ? "APPROVED" : "REJECTED";
  const note = String(formData.get("note") ?? "");
  const result = await decideLeave(id, decision, admin.id, note);
  if (!result.ok) return { error: result.error };
  await recordAudit({
    actorUserId: admin.id,
    action: decision === "APPROVED" ? "HR_LEAVE_APPROVE" : "HR_LEAVE_REJECT",
    entityType: "LeaveRequest",
    entityId: id,
    summary: `${decision === "APPROVED" ? "Approved" : "Rejected"} leave request ${id}${note.trim() ? `: ${note.trim()}` : ""}`,
  });
  revalidatePath("/admin/hr/leave");
  revalidatePath("/admin/me");
  revalidatePath("/admin/calendar");
  return { success: decision === "APPROVED" ? "Approved." : "Rejected." };
}
