"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { createStaffUser, setUserRoles, deleteStaffUser } from "@/modules/iam/users";
import { recordAudit } from "@/modules/iam/audit";

export interface UserActionState {
  error?: string;
  success?: boolean;
}

export async function createUserAction(_prev: UserActionState | null, formData: FormData): Promise<UserActionState> {
  const admin = await requireAdmin(PERMISSIONS.STAFF_MANAGE);

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const roleIds = formData.getAll("roleIds").map(String);

  try {
    const { id } = await createStaffUser({ email, fullName, title, password, roleIds });
    await recordAudit({
      actorUserId: admin.id,
      action: "USER_CREATE",
      entityType: "User",
      entityId: id,
      summary: `Created staff user ${email} (${fullName}) with ${roleIds.length} role(s)`,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create user." };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function setUserRolesAction(_prev: UserActionState | null, formData: FormData): Promise<UserActionState> {
  const admin = await requireAdmin(PERMISSIONS.STAFF_MANAGE);

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { error: "Missing user." };
  const roleIds = formData.getAll("roleIds").map(String);

  try {
    await setUserRoles(userId, roleIds);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update roles." };
  }

  await recordAudit({
    actorUserId: admin.id,
    action: "USER_ROLES_UPDATE",
    entityType: "User",
    entityId: userId,
    summary: `Set ${roleIds.length} role(s) on user ${userId}`,
  });
  revalidatePath("/admin/users");
  return { success: true };
}

export async function deleteUserAction(_prev: UserActionState | null, formData: FormData): Promise<UserActionState> {
  const admin = await requireAdmin(PERMISSIONS.STAFF_MANAGE);

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { error: "Missing user." };
  // Guard against locking yourself out.
  if (userId === admin.id) return { error: "You cannot delete your own account." };

  try {
    await deleteStaffUser(userId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete user." };
  }

  await recordAudit({
    actorUserId: admin.id,
    action: "USER_DELETE",
    entityType: "User",
    entityId: userId,
    summary: `Deleted staff user ${userId}`,
  });
  revalidatePath("/admin/users");
  return { success: true };
}
