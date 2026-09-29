"use server";

// Server actions for the client roster: save the current filter view as a named
// segment, and delete a segment. Both re-check CLIENT_MANAGE first and audit.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import { createSegment, deleteSegment, type SegmentFilter } from "@/modules/crm/segments";
import { createLead, assignOwner } from "@/modules/crm/leads";
import { prisma } from "@/lib/db";
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

// --- Bulk actions from the roster ------------------------------------------

export type BulkResult = { ok: true; count: number } | { ok: false; error: string };

function cleanIds(ids: unknown): string[] {
  return Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === "string" && x.length > 0))].slice(0, 500) : [];
}

// Adds one tag to every selected customer (idempotent per customer).
export async function bulkAddTagAction(clientProfileIds: string[], tag: string): Promise<BulkResult> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  const ids = cleanIds(clientProfileIds);
  const clean = String(tag ?? "").trim().slice(0, 40);
  if (ids.length === 0) return { ok: false, error: "Select at least one customer." };
  if (!clean) return { ok: false, error: "Enter a tag." };

  const rows = await prisma.clientProfile.findMany({ where: { id: { in: ids } }, select: { id: true, tags: true } });
  const toUpdate = rows.filter((r) => !r.tags.includes(clean));
  await prisma.$transaction(toUpdate.map((r) => prisma.clientProfile.update({ where: { id: r.id }, data: { tags: [...r.tags, clean] } })));
  await recordAudit({ actorUserId: admin.id, action: "CLIENT_BULK_TAG", entityType: "ClientProfile", summary: `Tagged ${toUpdate.length} customer(s) with "${clean}"` });
  revalidatePath("/admin/clients");
  return { ok: true, count: toUpdate.length };
}

// Assigns (or clears, ownerId "") the owner on every selected customer.
export async function bulkAssignOwnerAction(clientProfileIds: string[], ownerId: string): Promise<BulkResult> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  const ids = cleanIds(clientProfileIds);
  if (ids.length === 0) return { ok: false, error: "Select at least one customer." };
  const owner = String(ownerId ?? "").trim() || null;
  if (owner) {
    const exists = await prisma.user.findFirst({ where: { id: owner, type: "STAFF" }, select: { id: true } });
    if (!exists) return { ok: false, error: "Unknown staff member." };
  }
  const rows = await prisma.clientProfile.findMany({ where: { id: { in: ids } }, select: { id: true, ownerId: true } });
  let count = 0;
  for (const r of rows) {
    if (r.ownerId === owner) continue;
    await assignOwner(r.id, owner, admin.id);
    count += 1;
  }
  await recordAudit({ actorUserId: admin.id, action: "CLIENT_BULK_ASSIGN", entityType: "ClientProfile", summary: `Assigned ${count} customer(s) to ${owner ?? "nobody"}` });
  revalidatePath("/admin/clients");
  return { ok: true, count };
}
