import { prisma } from "@/lib/db";
import { getSession } from "./session";
import type { PermissionKey } from "./permissions";

export async function getUserPermissions(userId: string): Promise<Set<PermissionKey>> {
  const rows = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  const set = new Set<PermissionKey>();
  for (const ur of rows) for (const rp of ur.role.permissions) set.add(rp.permission.key as PermissionKey);
  return set;
}

export async function hasPermission(userId: string, key: PermissionKey): Promise<boolean> {
  return (await getUserPermissions(userId)).has(key);
}

export async function getCurrentUser(token: string | undefined) {
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  return { id: session.userId, permissions: await getUserPermissions(session.userId) };
}
