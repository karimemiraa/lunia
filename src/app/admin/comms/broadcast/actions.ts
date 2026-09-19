"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { BROADCAST_CHANNELS, sendBroadcast, type BroadcastChannel } from "@/modules/comms/broadcast";

export interface BroadcastActionState {
  error?: string;
  result?: { recipientCount: number; sentCount: number; failedCount: number; skippedNoContact: number };
}

// Re-checks MARKETING_MANAGE on every call. Sends the composed broadcast to
// the chosen audience via the CommsSender pipeline (stub outside production,
// so no real message leaves in dev/CI).
export async function sendBroadcastAction(
  _prev: BroadcastActionState | null,
  formData: FormData,
): Promise<BroadcastActionState> {
  const admin = await requireAdmin(PERMISSIONS.MARKETING_MANAGE);

  const channel = String(formData.get("channel") ?? "");
  const locale = String(formData.get("locale") ?? "ar");
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const audience = String(formData.get("audience") ?? "");
  const audienceLabel = String(formData.get("audienceLabel") ?? audience);

  if (!BROADCAST_CHANNELS.includes(channel as BroadcastChannel)) {
    return { error: "Please choose a valid channel." };
  }
  if (!body) {
    return { error: "Please write a message before sending." };
  }
  if (channel === "email" && !subject) {
    return { error: "Email broadcasts need a subject line." };
  }
  if (!audience) {
    return { error: "Please choose an audience." };
  }

  try {
    const result = await sendBroadcast({
      channel: channel as BroadcastChannel,
      locale,
      subject: subject || undefined,
      body,
      audience,
      audienceLabel,
      createdById: admin.id,
    });
    revalidatePath("/admin/comms/broadcast");
    return {
      result: {
        recipientCount: result.recipientCount,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        skippedNoContact: result.skippedNoContact,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send broadcast." };
  }
}
