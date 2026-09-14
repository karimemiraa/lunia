"use server";

// Server actions for the client roster: save the current filter view as a named
// segment, and delete a segment. Both re-check CLIENT_MANAGE first and audit.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import { createSegment, deleteSegment, type SegmentFilter } from "@/modules/crm/segments";

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
