import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/iam/rbac";
import type { PermissionKey } from "@/modules/iam/permissions";

export interface AdminUser {
  id: string;
  permissions: Set<PermissionKey>;
}

export type AdminAccessDecision = "login" | "forbidden" | "ok";

/**
 * Pure decision logic for the admin guard, kept separate from `requireAdmin`
 * so it can be unit-tested without mocking next/headers or next/navigation.
 */
export function decideAdminAccess(user: AdminUser | null, permission?: PermissionKey): AdminAccessDecision {
  if (!user) return "login";
  if (permission && !user.permissions.has(permission)) return "forbidden";
  return "ok";
}

/**
 * Server-side guard for admin pages. Reads the `lunia_session` cookie,
 * resolves the current user, and redirects when access is not allowed:
 * - no (valid) session -> /admin/login
 * - session present but missing the required permission -> /admin
 *
 * Returns the resolved user when access is allowed.
 */
export async function requireAdmin(permission?: PermissionKey): Promise<AdminUser> {
  const token = (await cookies()).get("lunia_session")?.value;
  const user = await getCurrentUser(token);

  switch (decideAdminAccess(user, permission)) {
    case "login":
      redirect("/admin/login");
      break;
    case "forbidden":
      redirect("/admin");
      break;
  }

  return user as AdminUser;
}
