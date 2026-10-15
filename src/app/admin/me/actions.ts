"use server";

// Self-service time & leave for ANY signed-in staff member (no extra
// permission): every action acts only on the caller's own records.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { clockIn, clockOut } from "@/modules/hr/attendance";
import { cancelOwnLeave, requestLeave, type LeaveRequestInput } from "@/modules/hr/leave";
import type { FormState } from "../hr/_components/ActionForm";
import { getStaffT } from "../_i18n/display";

export async function clockAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const t = await getStaffT();
  const direction = formData.get("direction");
  const result = direction === "out" ? await clockOut(user.id) : await clockIn(user.id);
  if (!result.ok) return { error: t(result.error) };
  revalidatePath("/admin/me");
  return { success: direction === "out" ? t("Clocked out.") : t("Clocked in.") };
}

export async function requestLeaveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const t = await getStaffT();
  const result = await requestLeave(user.id, {
    type: String(formData.get("type") ?? "") as LeaveRequestInput["type"],
    startDateISO: String(formData.get("startDateISO") ?? ""),
    endDateISO: String(formData.get("endDateISO") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!result.ok) return { error: t(result.error) };
  revalidatePath("/admin/me");
  revalidatePath("/admin/hr/leave");
  return { success: t("Request sent for approval.") };
}

export async function cancelLeaveAction(id: string): Promise<FormState> {
  const user = await requireAdmin();
  const t = await getStaffT();
  const result = await cancelOwnLeave(id, user.id);
  if (!result.ok) return { error: t(result.error) };
  revalidatePath("/admin/me");
  revalidatePath("/admin/hr/leave");
  return { success: t("Cancelled.") };
}
