"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { setLeadStage, logActivity, setFollowUp } from "@/modules/crm/leads";
import { stageKeys } from "@/modules/crm/pipeline";

export type MoveResult = { ok: true } | { ok: false; error: string };

// Moves a lead/customer to a new pipeline stage from the Leads board.
export async function moveLeadStageAction(clientProfileId: string, stage: string): Promise<MoveResult> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  if (!clientProfileId) return { ok: false, error: "Missing lead." };
  if (!(await stageKeys()).includes(stage)) return { ok: false, error: "Invalid stage." };
  try {
    await setLeadStage(clientProfileId, stage, admin.id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to move lead." };
  }
  revalidatePath("/admin/leads");
  return { ok: true };
}

const QUICK_OUTCOMES = ["REACHED", "NO_ANSWER", "INTERESTED", "NOT_INTERESTED", "BOOKED"] as const;
export type QuickOutcome = (typeof QUICK_OUTCOMES)[number];

// Quick call log from a board card: one activity row (kind CALL) plus an
// optional next follow-up in N days (no-answer defaults to tomorrow).
export async function quickLogCallAction(clientProfileId: string, outcome: string, note: string, followUpInDays: number | null): Promise<MoveResult> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  if (!clientProfileId) return { ok: false, error: "Missing lead." };
  if (!(QUICK_OUTCOMES as readonly string[]).includes(outcome)) return { ok: false, error: "Pick an outcome." };
  const days = followUpInDays === null ? null : Math.min(Math.max(Math.trunc(followUpInDays), 0), 365);
  try {
    await logActivity({ clientProfileId, authorUserId: admin.id, kind: "CALL", outcome, body: note.trim().slice(0, 2000) || null });
    if (days !== null) await setFollowUp(clientProfileId, new Date(Date.now() + days * 24 * 60 * 60 * 1000));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to log the call." };
  }
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/clients/${clientProfileId}`);
  return { ok: true };
}
