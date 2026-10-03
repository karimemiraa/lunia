"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../admin/_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import {
  SECRET_GROUPS,
  setSecret,
  setCustomCredential,
  deleteCustomCredential,
} from "@/modules/platform/secrets";
import { createStage, updateStage, deleteStage, reorderStage, type StageKind } from "@/modules/crm/pipeline";
import { getSetting, setSetting, THEME_KEYS, type ThemeKey, EDITION_KEYS, type EditionKey } from "@/modules/cms/settings";

export interface PlatformActionState {
  error?: string;
  success?: boolean;
}

// Saves one integration group's fields. Blank inputs are IGNORED (the value is
// kept) since the form never prefills secrets — so saving can't accidentally
// wipe a stored token. Superadmin-only (PLATFORM_MANAGE).
export async function saveSecretsAction(_prev: PlatformActionState | null, formData: FormData): Promise<PlatformActionState> {
  const admin = await requireAdmin(PERMISSIONS.PLATFORM_MANAGE);
  const groupId = String(formData.get("group") ?? "");
  const group = SECRET_GROUPS.find((g) => g.id === groupId);
  if (!group) return { error: "Unknown group." };

  try {
    for (const field of group.fields) {
      const raw = formData.get(field.key);
      if (raw === null) continue;
      const value = String(raw).trim();
      if (value.length === 0) continue; // blank = keep current
      await setSecret(field.key, value, admin.id);
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save." };
  }

  await recordAudit({
    actorUserId: admin.id,
    action: "PLATFORM_SECRET_UPDATE",
    entityType: "PlatformSecret",
    entityId: group.id,
    summary: `Updated ${group.title} credentials`,
  });
  revalidatePath("/superadmin");
  return { success: true };
}

export async function addCustomCredentialAction(_prev: PlatformActionState | null, formData: FormData): Promise<PlatformActionState> {
  const admin = await requireAdmin(PERMISSIONS.PLATFORM_MANAGE);
  const name = String(formData.get("name") ?? "").trim();
  const value = String(formData.get("value") ?? "").trim();
  if (!name || !value) return { error: "Both a name and a value are required." };
  try {
    await setCustomCredential(name, value, admin.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add credential." };
  }
  await recordAudit({
    actorUserId: admin.id,
    action: "PLATFORM_SECRET_UPDATE",
    entityType: "PlatformSecret",
    entityId: `custom:${name}`,
    summary: `Added API credential "${name}"`,
  });
  revalidatePath("/superadmin");
  return { success: true };
}

export async function deleteCustomCredentialAction(name: string): Promise<PlatformActionState> {
  const admin = await requireAdmin(PERMISSIONS.PLATFORM_MANAGE);
  try {
    await deleteCustomCredential(name);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete credential." };
  }
  await recordAudit({
    actorUserId: admin.id,
    action: "PLATFORM_SECRET_DELETE",
    entityType: "PlatformSecret",
    entityId: `custom:${name}`,
    summary: `Deleted API credential "${name}"`,
  });
  revalidatePath("/superadmin");
  return { success: true };
}

// --- CRM pipeline stages -----------------------------------------------------

function normalizeKind(raw: string): StageKind {
  return raw === "won" || raw === "lost" ? raw : "open";
}

export async function createStageAction(_prev: PlatformActionState | null, formData: FormData): Promise<PlatformActionState> {
  const admin = await requireAdmin(PERMISSIONS.PLATFORM_MANAGE);
  const label = String(formData.get("label") ?? "").trim();
  const kind = normalizeKind(String(formData.get("kind") ?? "open"));
  const color = String(formData.get("color") ?? "").trim() || undefined;
  if (!label) return { error: "A stage name is required." };
  try {
    await createStage({ label, kind, color });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add stage." };
  }
  await recordAudit({ actorUserId: admin.id, action: "PIPELINE_STAGE_CREATE", entityType: "PipelineStage", summary: `Added pipeline stage "${label}"` });
  revalidatePath("/superadmin");
  revalidatePath("/admin/leads");
  return { success: true };
}

export async function updateStageAction(_prev: PlatformActionState | null, formData: FormData): Promise<PlatformActionState> {
  const admin = await requireAdmin(PERMISSIONS.PLATFORM_MANAGE);
  const id = String(formData.get("id") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const kind = normalizeKind(String(formData.get("kind") ?? "open"));
  const color = String(formData.get("color") ?? "").trim() || undefined;
  if (!id) return { error: "Missing stage." };
  try {
    await updateStage(id, { label, kind, color });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save stage." };
  }
  await recordAudit({ actorUserId: admin.id, action: "PIPELINE_STAGE_UPDATE", entityType: "PipelineStage", entityId: id, summary: `Updated pipeline stage "${label}"` });
  revalidatePath("/superadmin");
  revalidatePath("/admin/leads");
  return { success: true };
}

export async function deleteStageAction(id: string): Promise<PlatformActionState> {
  const admin = await requireAdmin(PERMISSIONS.PLATFORM_MANAGE);
  try {
    await deleteStage(id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete stage." };
  }
  await recordAudit({ actorUserId: admin.id, action: "PIPELINE_STAGE_DELETE", entityType: "PipelineStage", entityId: id, summary: `Deleted pipeline stage ${id}` });
  revalidatePath("/superadmin");
  revalidatePath("/admin/leads");
  return { success: true };
}

export async function reorderStageAction(id: string, dir: -1 | 1): Promise<PlatformActionState> {
  await requireAdmin(PERMISSIONS.PLATFORM_MANAGE);
  try {
    await reorderStage(id, dir);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to reorder stage." };
  }
  revalidatePath("/superadmin");
  revalidatePath("/admin/leads");
  return { success: true };
}

// --- Website theme -----------------------------------------------------------

export async function setThemeAction(theme: string): Promise<PlatformActionState> {
  const admin = await requireAdmin(PERMISSIONS.PLATFORM_MANAGE);
  if (!(THEME_KEYS as readonly string[]).includes(theme)) return { error: "Unknown theme." };
  const appearance = await getSetting("appearance").catch(() => null);
  const current = appearance?.theme ?? "luminous";
  await setSetting("appearance", { theme: theme as ThemeKey, edition: appearance?.edition ?? "cinematic" });
  await recordAudit({
    actorUserId: admin.id,
    action: "WEBSITE_THEME_CHANGE",
    entityType: "SiteSetting",
    entityId: "appearance",
    summary: `Website theme: ${current} -> ${theme}`,
  });
  // Every public page is dynamic; revalidating the layout root flushes any
  // cached RSC payloads so the new theme shows on the next request.
  revalidatePath("/", "layout");
  revalidatePath("/superadmin");
  return { success: true };
}

// --- Staff menu visibility ---------------------------------------------------

export async function saveNavVisibilityAction(hiddenHrefs: string[]): Promise<PlatformActionState> {
  const admin = await requireAdmin(PERMISSIONS.PLATFORM_MANAGE);
  const clean = Array.from(new Set(hiddenHrefs.filter((h) => typeof h === "string" && h.startsWith("/admin"))));
  await setSetting("adminNav", { hiddenHrefs: clean });
  await recordAudit({
    actorUserId: admin.id,
    action: "ADMIN_NAV_VISIBILITY_UPDATE",
    entityType: "SiteSetting",
    entityId: "adminNav",
    summary: clean.length ? `Hidden menu items: ${clean.join(", ")}` : "All menu items visible",
  });
  revalidatePath("/admin", "layout");
  revalidatePath("/superadmin");
  return { success: true };
}

// --- Website edition (homepage design) --------------------------------------

export async function setEditionAction(edition: string): Promise<PlatformActionState> {
  const admin = await requireAdmin(PERMISSIONS.PLATFORM_MANAGE);
  if (!(EDITION_KEYS as readonly string[]).includes(edition)) return { error: "Unknown edition." };
  const appearance = await getSetting("appearance").catch(() => null);
  const current = appearance?.edition ?? "cinematic";
  await setSetting("appearance", { theme: appearance?.theme ?? "luminous", edition: edition as EditionKey });
  await recordAudit({
    actorUserId: admin.id,
    action: "WEBSITE_EDITION_CHANGE",
    entityType: "SiteSetting",
    entityId: "appearance",
    summary: `Homepage edition: ${current} -> ${edition}`,
  });
  revalidatePath("/", "layout");
  revalidatePath("/superadmin");
  return { success: true };
}
