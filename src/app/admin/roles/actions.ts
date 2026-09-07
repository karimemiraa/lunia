"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS, ALL_PERMISSION_KEYS, type PermissionKey } from "@/modules/iam/permissions";
import { createRole, setRolePermissions, deleteRole } from "@/modules/iam/roles";

export interface RoleActionState {
  error?: string;
  success?: boolean;
}

// Saves the full set of permission keys checked for one role. Reads every
// `permissions` value from the row's form, keeps only the ones that are
// actually known permission keys (defense in depth — setRolePermissions
// validates too), and replaces the role's grants with that set.
export async function saveRolePermissions(_prev: RoleActionState | null, formData: FormData): Promise<RoleActionState> {
  await requireAdmin(PERMISSIONS.STAFF_MANAGE);

  const roleId = String(formData.get("roleId") ?? "").trim();
  if (!roleId) {
    return { error: "Missing role." };
  }

  const checked = formData.getAll("permissions").map(String);
  const keys = checked.filter((key): key is PermissionKey => (ALL_PERMISSION_KEYS as string[]).includes(key));

  try {
    await setRolePermissions(roleId, keys);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save permissions." };
  }

  revalidatePath("/admin/roles");
  return { success: true };
}

export async function createRoleAction(_prev: RoleActionState | null, formData: FormData): Promise<RoleActionState> {
  await requireAdmin(PERMISSIONS.STAFF_MANAGE);

  const key = String(formData.get("key") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!key || !name) {
    return { error: "Key and name are required." };
  }

  try {
    await createRole({ key, name });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create role." };
  }

  revalidatePath("/admin/roles");
  return { success: true };
}

// deleteRole already throws when the target role is a system role; the UI
// hides the delete button for system roles too, but we still surface the
// service's error here in case it's ever reached directly.
export async function deleteRoleAction(_prev: RoleActionState | null, formData: FormData): Promise<RoleActionState> {
  await requireAdmin(PERMISSIONS.STAFF_MANAGE);

  const roleId = String(formData.get("roleId") ?? "").trim();
  if (!roleId) {
    return { error: "Missing role." };
  }

  try {
    await deleteRole(roleId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete role." };
  }

  revalidatePath("/admin/roles");
  return { success: true };
}
