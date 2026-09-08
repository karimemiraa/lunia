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

// Resolves the *staff* user behind a `lunia_session` token -- used by
// requireAdmin (and anything else gating admin/staff-only actions). Must
// only ever succeed for a STAFF user: a client's `lunia_client_session`
// token resolves to the same Session row shape via getSession, so without
// this type check a client session token would satisfy requireAdmin just
// as well as a staff one. Mirrors clientAuth.ts's getClientSessionUser,
// which enforces the opposite (`type !== "CLIENT"` -> null) for the client
// side of the same session mechanism.
export async function getCurrentUser(token: string | undefined) {
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.isActive === false) return null;
  if (user.type !== "STAFF") return null;
  return { id: session.userId, permissions: await getUserPermissions(session.userId) };
}
