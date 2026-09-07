import { prisma } from "@/lib/db";
import type { Role } from "@prisma/client";
import { ALL_PERMISSION_KEYS, type PermissionKey } from "@/modules/iam/permissions";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface CreateRoleInput {
  key: string;
  name: string;
}

export interface RoleWithPermissions {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissionKeys: PermissionKey[];
}

function assertValidKey(key: string): void {
  if (!SLUG_PATTERN.test(key)) {
    throw new Error(`Invalid role key "${key}": must be lowercase letters, digits, and hyphens only`);
  }
}

export async function listRolesWithPermissions(): Promise<RoleWithPermissions[]> {
  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: { permissions: { include: { permission: true } } },
  });

  return roles.map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    isSystem: role.isSystem,
    permissionKeys: role.permissions.map((rp) => rp.permission.key as PermissionKey),
  }));
}

export async function createRole(input: CreateRoleInput): Promise<Role> {
  assertValidKey(input.key);

  const existing = await prisma.role.findUnique({ where: { key: input.key } });
  if (existing) {
    throw new Error(`Role with key "${input.key}" already exists`);
  }

  return prisma.role.create({ data: { key: input.key, name: input.name } });
}

export async function setRolePermissions(roleId: string, permissionKeys: PermissionKey[]): Promise<void> {
  const invalid = permissionKeys.filter((key) => !ALL_PERMISSION_KEYS.includes(key));
  if (invalid.length > 0) {
    throw new Error(`Invalid permission key(s): ${invalid.join(", ")}`);
  }

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) {
    throw new Error(`Role "${roleId}" not found`);
  }

  const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } } });
  if (permissions.length !== permissionKeys.length) {
    throw new Error("One or more permission keys do not exist in the database");
  }

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
    }),
  ]);
}

export async function deleteRole(roleId: string): Promise<void> {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) {
    throw new Error(`Role "${roleId}" not found`);
  }
  if (role.isSystem) {
    throw new Error(`Cannot delete system role "${role.key}"`);
  }

  await prisma.role.delete({ where: { id: roleId } });
}
