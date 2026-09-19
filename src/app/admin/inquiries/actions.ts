"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { setInquiryHandled, assignInquiry, linkInquiryToCustomer, replyToInquiry } from "@/modules/catalog/inquiries";
import { recordAudit } from "@/modules/iam/audit";

// Toggles the handled flag on an inquiry from the read-only admin list.
export async function setHandledAction(formData: FormData): Promise<void> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const id = String(formData.get("id") ?? "");
  const handled = String(formData.get("handled") ?? "") === "true";
  if (!id) return;

  await setInquiryHandled(id, handled);
  revalidatePath("/admin/inquiries");
}

export interface InquiryActionState {
  error?: string;
  success?: boolean;
}

export async function assignInquiryAction(_prev: InquiryActionState | null, formData: FormData): Promise<InquiryActionState> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing inquiry." };
  const assignedToId = String(formData.get("assignedToId") ?? "").trim() || null;
  try {
    await assignInquiry(id, assignedToId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to assign." };
  }
  revalidatePath(`/admin/inquiries/${id}`);
  return { success: true };
}

export async function linkCustomerAction(_prev: InquiryActionState | null, formData: FormData): Promise<InquiryActionState> {
  const admin = await requireAdmin(PERMISSIONS.CMS_MANAGE);
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing inquiry." };
  try {
    await linkInquiryToCustomer(id, admin.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to link customer." };
  }
  revalidatePath(`/admin/inquiries/${id}`);
  return { success: true };
}

export async function replyInquiryAction(_prev: InquiryActionState | null, formData: FormData): Promise<InquiryActionState> {
  const admin = await requireAdmin(PERMISSIONS.CMS_MANAGE);
  const id = String(formData.get("id") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  if (!id) return { error: "Missing inquiry." };
  try {
    await replyToInquiry(id, body, admin.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send reply." };
  }
  await recordAudit({ actorUserId: admin.id, action: "INQUIRY_REPLY", entityType: "ContactInquiry", entityId: id, summary: `Replied to inquiry ${id} by email` });
  revalidatePath(`/admin/inquiries/${id}`);
  return { success: true };
}
