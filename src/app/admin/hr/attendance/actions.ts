"use server";

// Manual attendance corrections (hr:manage). Each change is audited and the
// record is stamped source MANUAL with the editor's id.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import { deleteAttendance, saveManualAttendance } from "@/modules/hr/attendance";
import type { FormState } from "../_components/ActionForm";
import { translateError } from "../_components/errors";
import { getStaffT } from "../../_i18n/display";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "");

export async function saveAttendanceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin(PERMISSIONS.HR_MANAGE);
  const t = await getStaffT();
  const input = {
    id: str(formData, "id"),
    userId: str(formData, "userId"),
    dateISO: str(formData, "dateISO"),
    clockIn: str(formData, "clockIn"),
    clockOut: str(formData, "clockOut"),
    note: str(formData, "note"),
  };
  const result = await saveManualAttendance(input, admin.id);
  if (!result.ok) return { error: translateError(t, result.error) };
  await recordAudit({
    actorUserId: admin.id,
    action: input.id ? "HR_ATTENDANCE_EDIT" : "HR_ATTENDANCE_ADD",
    entityType: "AttendanceRecord",
    entityId: result.id,
    summary: `${input.id ? "Corrected" : "Added"} attendance for user ${input.userId} on ${input.dateISO} (${input.clockIn}-${input.clockOut || "open"}): ${input.note}`,
  });
  revalidatePath("/admin/hr/attendance");
  return { success: t("Saved.") };
}

export async function deleteAttendanceAction(id: string): Promise<FormState> {
  const admin = await requireAdmin(PERMISSIONS.HR_MANAGE);
  const t = await getStaffT();
  if (!(await deleteAttendance(id))) return { error: t("Record not found.") };
  await recordAudit({
    actorUserId: admin.id,
    action: "HR_ATTENDANCE_DELETE",
    entityType: "AttendanceRecord",
    entityId: id,
    summary: `Deleted attendance record ${id}`,
  });
  revalidatePath("/admin/hr/attendance");
  return { success: t("Deleted.") };
}
