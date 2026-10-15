"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { updateEditRequestStatus, EDIT_REQUEST_STATUSES } from "@/modules/editRequests/editRequests";
import { recordAudit } from "@/modules/iam/audit";
import { getStaffT } from "../_i18n/display";

export interface RequestStatusState {
  success?: boolean;
  error?: string;
}

export async function updateEditRequestStatusAction(_prev: RequestStatusState, formData: FormData): Promise<RequestStatusState> {
  const user = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  const t = await getStaffT();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("resolutionNote") ?? "").trim();
  if (!(EDIT_REQUEST_STATUSES as readonly string[]).includes(status)) return { error: t("Pick a status.") };
  try {
    const row = await updateEditRequestStatus({ id, status: status as (typeof EDIT_REQUEST_STATUSES)[number], resolutionNote: note || null }, user.id);
    await recordAudit({ actorUserId: user.id, action: "editRequest.status", entityType: "EditRequest", entityId: row.id, summary: `Edit request "${row.title}" → ${row.status}` });
  } catch {
    return { error: t("Couldn't update the request.") };
  }
  revalidatePath("/admin/requests");
  return { success: true };
}
