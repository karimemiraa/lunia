"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { setLeadStage, LEAD_STAGES } from "@/modules/crm/leads";
import type { LeadStage } from "@prisma/client";

export type MoveResult = { ok: true } | { ok: false; error: string };

// Moves a lead/customer to a new pipeline stage from the Leads board.
export async function moveLeadStageAction(clientProfileId: string, stage: string): Promise<MoveResult> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  if (!clientProfileId) return { ok: false, error: "Missing lead." };
  if (!(LEAD_STAGES as string[]).includes(stage)) return { ok: false, error: "Invalid stage." };
  try {
    await setLeadStage(clientProfileId, stage as LeadStage, admin.id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to move lead." };
  }
  revalidatePath("/admin/leads");
  return { ok: true };
}
