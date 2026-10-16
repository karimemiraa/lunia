"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS, ungrantableChanges } from "@/modules/iam/permissions";
import { listRolesWithPermissions } from "@/modules/iam/roles";
import { prisma } from "@/lib/db";
import { createStaffUser, setUserRoles, deleteStaffUser, setStaffArabicName } from "@/modules/iam/users";
import { recordAudit } from "@/modules/iam/audit";
import { getStaffT } from "../_i18n/display";
import { translateError } from "../hr/_components/errors";

export interface UserActionState {
  error?: string;
  success?: boolean;
}

/** Permission keys held through the given roles (or the target user's current roles). */
async function rolePermissionKeys(opts: { roleIds?: string[]; userId?: string }): Promise<string[]> {
  const roles = await listRolesWithPermissions();
  const ids = opts.userId ? (await prisma.userRole.findMany({ where: { userId: opts.userId }, select: { roleId: true } })).map((r) => r.roleId) : opts.roleIds ?? [];
  return [...new Set(roles.filter((r) => ids.includes(r.id)).flatMap((r) => r.permissionKeys))];
}

export async function createUserAction(_prev: UserActionState | null, formData: FormData): Promise<UserActionState> {
  const admin = await requireAdmin(PERMISSIONS.STAFF_MANAGE);
  const t = await getStaffT();

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const fullNameAr = String(formData.get("fullNameAr") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const roleIds = formData.getAll("roleIds").map(String);
  if (ungrantableChanges(admin.permissions, [], await rolePermissionKeys({ roleIds })).length > 0) {
    return { error: t("You can only give or take away roles within your own permissions.") };
  }

  try {
    const { id } = await createStaffUser({ email, fullName, fullNameAr, title, password, roleIds });
    await recordAudit({
      actorUserId: admin.id,
      action: "USER_CREATE",
      entityType: "User",
      entityId: id,
      summary: `Created staff user ${email} (${fullName}) with ${roleIds.length} role(s)`,
    });
  } catch (err) {
    return { error: err instanceof Error ? translateError(t, err.message) : t("Failed to create user.") };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function setStaffArabicNameAction(_prev: UserActionState | null, formData: FormData): Promise<UserActionState> {
  const admin = await requireAdmin(PERMISSIONS.STAFF_MANAGE);
  const t = await getStaffT();
  const userId = String(formData.get("userId") ?? "");
  const fullNameAr = String(formData.get("fullNameAr") ?? "");
  try {
    await setStaffArabicName(userId, fullNameAr);
  } catch (err) {
    return { error: err instanceof Error ? translateError(t, err.message) : t("Couldn't save the Arabic name.") };
  }
  await recordAudit({ actorUserId: admin.id, action: "USER_UPDATE", entityType: "User", entityId: userId, summary: `Set Arabic display name to "${fullNameAr.trim()}"` });
  revalidatePath("/admin/users");
  return { success: true };
}

export async function setUserRolesAction(_prev: UserActionState | null, formData: FormData): Promise<UserActionState> {
  const admin = await requireAdmin(PERMISSIONS.STAFF_MANAGE);
  const t = await getStaffT();

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { error: t("Missing user.") };
  const roleIds = formData.getAll("roleIds").map(String);

  // No escalation: every role added or removed must be within the editor's own permissions.
  const [roles, currentRoles] = await Promise.all([
    listRolesWithPermissions(),
    prisma.userRole.findMany({ where: { userId }, select: { roleId: true } }),
  ]);
  const before = new Set(currentRoles.map((r) => r.roleId));
  const changedRoles = roles.filter((r) => before.has(r.id) !== roleIds.includes(r.id));
  if (changedRoles.some((r) => ungrantableChanges(admin.permissions, r.permissionKeys, []).length > 0)) {
    return { error: t("You can only give or take away roles within your own permissions.") };
  }

  try {
    await setUserRoles(userId, roleIds);
  } catch (err) {
    return { error: err instanceof Error ? translateError(t, err.message) : t("Failed to update roles.") };
  }

  await recordAudit({
    actorUserId: admin.id,
    action: "USER_ROLES_UPDATE",
    entityType: "User",
    entityId: userId,
    summary: `Roles: ${roles.filter((r) => before.has(r.id)).map((r) => r.key).join(", ") || "none"} → ${roles.filter((r) => roleIds.includes(r.id)).map((r) => r.key).join(", ") || "none"}`,
  });
  revalidatePath("/admin/users");
  return { success: true };
}

export async function deleteUserAction(_prev: UserActionState | null, formData: FormData): Promise<UserActionState> {
  const admin = await requireAdmin(PERMISSIONS.STAFF_MANAGE);
  const t = await getStaffT();

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { error: t("Missing user.") };
  // Guard against locking yourself out.
  if (userId === admin.id) return { error: t("You cannot delete your own account.") };
  // No removing someone with more access than you (e.g. a manager deleting the owner).
  if (ungrantableChanges(admin.permissions, await rolePermissionKeys({ userId }), []).length > 0) {
    return { error: t("You can't delete someone with more access than you.") };
  }

  try {
    await deleteStaffUser(userId);
  } catch (err) {
    return { error: err instanceof Error ? translateError(t, err.message) : t("Failed to delete user.") };
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
