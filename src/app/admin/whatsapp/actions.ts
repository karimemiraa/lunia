"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { sendWhatsappMessage } from "@/modules/crm/whatsapp";

export interface WhatsappActionState {
  error?: string;
  success?: boolean;
}

export async function sendReplyAction(_prev: WhatsappActionState | null, formData: FormData): Promise<WhatsappActionState> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  if (!conversationId) return { error: "Missing conversation." };
  try {
    await sendWhatsappMessage(conversationId, body, admin.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send." };
  }
  revalidatePath("/admin/whatsapp");
  return { success: true };
}
