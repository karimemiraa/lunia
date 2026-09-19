"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { sendWhatsappMessage, assignConversation } from "@/modules/crm/whatsapp";

export interface WhatsappActionState {
  error?: string;
  success?: boolean;
}

export type AssignResult = { ok: true } | { ok: false; error: string };

// Assigns a WhatsApp conversation to a staff member (empty = unassign).
export async function assignConversationAction(conversationId: string, ownerId: string): Promise<AssignResult> {
  await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  if (!conversationId) return { ok: false, error: "Missing conversation." };
  try {
    await assignConversation(conversationId, ownerId || null);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to assign." };
  }
  revalidatePath("/admin/whatsapp");
  return { ok: true };
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
