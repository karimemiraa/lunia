// Staff user administration: list, create, delete staff accounts and assign
// roles to them. Client (customer) accounts are managed separately (CRM) and
// are never returned or created here — this is strictly the STAFF side.

import { prisma } from "@/lib/db";
import { hashPassword } from "./password";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export interface StaffUserRow {
  id: string;
  email: string | null;
  fullName: string;
  title: string | null;
  isActive: boolean;
  roleIds: string[];
  roleNames: string[];
}

/** All staff users with their profile + assigned role ids/names, oldest first. */
export async function listStaffUsers(): Promise<StaffUserRow[]> {
  const users = await prisma.user.findMany({
    where: { type: "STAFF" },
    include: { staffProfile: true, roles: { include: { role: true } } },
    orderBy: { createdAt: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.staffProfile?.fullName ?? "",
    title: u.staffProfile?.title ?? null,
    isActive: u.isActive,
    roleIds: u.roles.map((r) => r.roleId),
    roleNames: u.roles.map((r) => r.role.name),
  }));
}

export interface CreateStaffUserInput {
  email: string;
  fullName: string;
  password: string;
  title?: string;
  roleIds: string[];
}

/** Creates a STAFF user with a StaffProfile and the given roles. */
export async function createStaffUser(input: CreateStaffUserInput): Promise<{ id: string }> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!EMAIL_RE.test(email)) throw new Error("Please enter a valid email address");
  if (!fullName) throw new Error("A name is required");
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("A user with this email already exists");

  // Only assign roles that actually exist (guards against stale form ids).
  const roleIds = await validRoleIds(input.roleIds);

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      type: "STAFF",
      email,
      passwordHash,
      isActive: true,
      staffProfile: { create: { fullName, title: input.title?.trim() || null } },
      roles: { create: roleIds.map((roleId) => ({ roleId })) },
    },
  });
  return { id: user.id };
}

/** Replaces a staff user's role assignments with exactly `roleIds`. */
export async function setUserRoles(userId: string, roleIds: string[]): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.type !== "STAFF") throw new Error("Not a staff user");
  const valid = await validRoleIds(roleIds);
  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId } }),
    ...(valid.length > 0
      ? [prisma.userRole.createMany({ data: valid.map((roleId) => ({ userId, roleId })) })]
      : []),
  ]);
}

/** Permanently deletes a staff user (cascades roles + profile). */
export async function deleteStaffUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.type !== "STAFF") throw new Error("Not a staff user");
  await prisma.user.delete({ where: { id: userId } });
}

async function validRoleIds(roleIds: string[]): Promise<string[]> {
  const unique = [...new Set(roleIds)];
  if (unique.length === 0) return [];
  const rows = await prisma.role.findMany({ where: { id: { in: unique } }, select: { id: true } });
  return rows.map((r) => r.id);
}
