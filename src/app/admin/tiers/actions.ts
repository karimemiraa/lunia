"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { createTier, updateTier, deleteTier } from "@/modules/iam/tiers";
import { recordAudit } from "@/modules/iam/audit";

export interface TierActionState {
  error?: string;
  success?: boolean;
}

function numberOrUndefined(formData: FormData, name: string): number | undefined {
  const raw = formData.get(name);
  if (raw === null || String(raw).trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export async function createTierAction(_prev: TierActionState | null, formData: FormData): Promise<TierActionState> {
  const admin = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);

  const key = String(formData.get("key") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!key || !name) {
    return { error: "Key and name are required." };
  }

  try {
    await createTier({
      key,
      name,
      priority: numberOrUndefined(formData, "priority"),
      discountPct: numberOrUndefined(formData, "discountPct"),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create tier." };
  }

  await recordAudit({
    actorUserId: admin.id,
    action: "TIER_CREATE",
    entityType: "MembershipTier",
    summary: `Created tier ${key} (${name})`,
  });
  revalidatePath("/admin/tiers");
  return { success: true };
}

export async function updateTierAction(_prev: TierActionState | null, formData: FormData): Promise<TierActionState> {
  const admin = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "Missing tier." };
  }

  const name = String(formData.get("name") ?? "").trim();

  try {
    await updateTier(id, {
      name: name || undefined,
      priority: numberOrUndefined(formData, "priority"),
      discountPct: numberOrUndefined(formData, "discountPct"),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update tier." };
  }

  await recordAudit({
    actorUserId: admin.id,
    action: "TIER_UPDATE",
    entityType: "MembershipTier",
    entityId: id,
    summary: `Updated tier ${id}`,
  });
  revalidatePath("/admin/tiers");
  return { success: true };
}

// deleteTier already throws when the target tier is a system tier; the UI
// hides the delete button for system tiers too, but we still surface the
// service's error here in case it's ever reached directly.
export async function deleteTierAction(_prev: TierActionState | null, formData: FormData): Promise<TierActionState> {
  const admin = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "Missing tier." };
  }

  try {
    await deleteTier(id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete tier." };
  }

  await recordAudit({
    actorUserId: admin.id,
    action: "TIER_DELETE",
    entityType: "MembershipTier",
    entityId: id,
    summary: `Deleted tier ${id}`,
  });
  revalidatePath("/admin/tiers");
  return { success: true };
}
