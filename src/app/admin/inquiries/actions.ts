"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { setInquiryHandled } from "@/modules/catalog/inquiries";

// Toggles the handled flag on an inquiry from the read-only admin list.
export async function setHandledAction(formData: FormData): Promise<void> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const id = String(formData.get("id") ?? "");
  const handled = String(formData.get("handled") ?? "") === "true";
  if (!id) return;

  await setInquiryHandled(id, handled);
  revalidatePath("/admin/inquiries");
}
