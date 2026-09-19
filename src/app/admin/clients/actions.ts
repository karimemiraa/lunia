"use server";

// Server actions for the client roster: save the current filter view as a named
// segment, and delete a segment. Both re-check CLIENT_MANAGE first and audit.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import { createSegment, deleteSegment, type SegmentFilter } from "@/modules/crm/segments";
import { createLead } from "@/modules/crm/leads";
import type { LeadDirection } from "@prisma/client";

export interface RosterActionState {
  error?: string;
  success?: boolean;
}

// Adds a lead from the roster (e.g. telesales logging someone they're reaching
// out to). Reuses an existing person by phone/email. Guarded by CLIENT_MANAGE.
export async function createLeadAction(_prev: RosterActionState | null, formData: FormData): Promise<RosterActionState> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const directionRaw = String(formData.get("direction") ?? "OUTBOUND").trim();
  const direction: LeadDirection = directionRaw === "INBOUND" ? "INBOUND" : "OUTBOUND";
  const ownerId = String(formData.get("ownerId") ?? "").trim() || admin.id;

  try {
    await createLead({ fullName, phone, email, source, direction, ownerId, byUserId: admin.id });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add lead." };
  }

  await recordAudit({ actorUserId: admin.id, action: "LEAD_CREATE", entityType: "ClientProfile", summary: `Added lead "${fullName}" (${direction.toLowerCase()})` });
  revalidatePath("/admin/clients");
  return { success: true };
}

export async function saveSegmentAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const filter: SegmentFilter = {
    search: String(formData.get("search") ?? "").trim() || undefined,
    tierKey: String(formData.get("tierKey") ?? "").trim() || undefined,
    source: String(formData.get("source") ?? "").trim() || undefined,
    status: String(formData.get("status") ?? "").trim() || undefined,
    tag: String(formData.get("tag") ?? "").trim() || undefined,
    stage: String(formData.get("stage") ?? "").trim() || undefined,
    ownerId: String(formData.get("ownerId") ?? "").trim() || undefined,
    direction: String(formData.get("direction") ?? "").trim() || undefined,
  };

  const segment = await createSegment(name, filter, admin.id);
  await recordAudit({
    actorUserId: admin.id,
    action: "SEGMENT_CREATE",
    entityType: "Segment",
    entityId: segment.id,
    summary: `Created client segment "${name}"`,
  });
  revalidatePath("/admin/clients");
}

export async function deleteSegmentAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  const id = String(formData.get("segmentId") ?? "").trim();
  if (!id) return;
  await deleteSegment(id);
  await recordAudit({
    actorUserId: admin.id,
    action: "SEGMENT_DELETE",
    entityType: "Segment",
    entityId: id,
    summary: `Deleted client segment "${id}"`,
  });
  revalidatePath("/admin/clients");
}
