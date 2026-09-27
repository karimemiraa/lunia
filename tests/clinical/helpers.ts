import { prisma } from "@/lib/db";
import type { PermissionKey } from "@/modules/iam/permissions";

let n = 0;
const uniq = () => `${Date.now()}${(n += 1)}${Math.random().toString(36).slice(2, 6)}`;

/** A throwaway CLIENT user + profile. */
export async function makeClient(name = "Clinical Test") {
  const user = await prisma.user.create({
    data: { type: "CLIENT", email: `clinical-${uniq()}@lunia.test`, clientProfile: { create: { fullName: name } } },
    include: { clientProfile: true },
  });
  return { userId: user.id, clientProfileId: user.clientProfile!.id };
}

/** A throwaway STAFF user holding exactly `permissions` (via a temp role). */
export async function makeStaff(permissions: PermissionKey[]) {
  const key = `test-role-${uniq()}`;
  const perms = await Promise.all(
    permissions.map((k) => prisma.permission.upsert({ where: { key: k }, update: {}, create: { key: k } })),
  );
  const role = await prisma.role.create({
    data: { key, name: key, permissions: { create: perms.map((p) => ({ permissionId: p.id })) } },
  });
  const user = await prisma.user.create({
    data: { type: "STAFF", email: `staff-${uniq()}@lunia.local`, roles: { create: { roleId: role.id } } },
  });
  return { userId: user.id, roleId: role.id };
}

export async function cleanupUsers(userIds: string[], roleIds: string[] = []) {
  if (userIds.length) {
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  if (roleIds.length) await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
}

/** 1x1 PNG bytes. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
export const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG.toString("base64")}`;
