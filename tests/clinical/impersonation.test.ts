import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { getClientSessionUser } from "@/modules/iam/clientAuth";
import { PERMISSIONS, type PermissionKey } from "@/modules/iam/permissions";
import {
  IMPERSONATION_TTL_SECONDS,
  canImpersonate,
  endImpersonation,
  getImpersonation,
  startImpersonation,
} from "@/modules/iam/impersonation";
import { cleanupUsers, makeClient, makeStaff } from "./helpers";

const users: string[] = [];
const roles: string[] = [];

afterAll(async () => {
  await cleanupUsers(users, roles);
  getRedis().disconnect();
});

async function admin(perms: PermissionKey[] = [PERMISSIONS.SETTINGS_MANAGE]) {
  const s = await makeStaff(perms);
  users.push(s.userId);
  roles.push(s.roleId);
  return { id: s.userId, permissions: new Set<PermissionKey>(perms) };
}

describe("view as customer (impersonation)", () => {
  it("is limited to platform:manage or settings:manage", () => {
    expect(canImpersonate(new Set([PERMISSIONS.PLATFORM_MANAGE]))).toBe(true);
    expect(canImpersonate(new Set([PERMISSIONS.SETTINGS_MANAGE]))).toBe(true);
    expect(canImpersonate(new Set([PERMISSIONS.STAFF_MANAGE, PERMISSIONS.CLIENT_MANAGE]))).toBe(false);
  });

  it("refuses an actor without permission", async () => {
    const actor = await admin([PERMISSIONS.STAFF_MANAGE]);
    const c = await makeClient();
    users.push(c.userId);
    await expect(
      startImpersonation({ actorUserId: actor.id, actorPermissions: actor.permissions, clientProfileId: c.clientProfileId }),
    ).rejects.toThrow(/permission/);
  });

  it("cannot target staff accounts", async () => {
    const actor = await admin();
    // A STAFF user that also has a client profile.
    const staff = await prisma.user.create({
      data: { type: "STAFF", email: `imp-staff-${Date.now()}@lunia.local`, clientProfile: { create: { fullName: "Staff With Profile" } } },
      include: { clientProfile: true },
    });
    users.push(staff.id);
    await expect(
      startImpersonation({ actorUserId: actor.id, actorPermissions: actor.permissions, clientProfileId: staff.clientProfile!.id }),
    ).rejects.toThrow(/Staff accounts/);

    // A CLIENT-typed user that holds a staff role.
    const c = await makeClient();
    users.push(c.userId);
    const role = await prisma.role.findFirstOrThrow({ where: { id: roles[roles.length - 1] } });
    await prisma.userRole.create({ data: { userId: c.userId, roleId: role.id } });
    await expect(
      startImpersonation({ actorUserId: actor.id, actorPermissions: actor.permissions, clientProfileId: c.clientProfileId }),
    ).rejects.toThrow(/Staff accounts/);

    const audits = await prisma.auditLog.count({ where: { actorUserId: actor.id, action: "customer.view_as.start" } });
    expect(audits).toBe(0);
  });

  it("creates a 1-hour client session, audits start and end, and Exit destroys the session", async () => {
    const actor = await admin();
    const c = await makeClient("Sara Test");
    users.push(c.userId);

    const result = await startImpersonation({ actorUserId: actor.id, actorPermissions: actor.permissions, clientProfileId: c.clientProfileId });
    expect(result.clientName).toBe("Sara Test");
    expect(await getClientSessionUser(result.sessionToken)).toEqual({ id: c.userId });

    const ttl = await getRedis().ttl(`session:${result.sessionToken}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(IMPERSONATION_TTL_SECONDS);

    const marker = await getImpersonation(result.markerId);
    expect(marker?.actorUserId).toBe(actor.id);
    expect(marker?.clientProfileId).toBe(c.clientProfileId);

    const start = await prisma.auditLog.findFirst({ where: { actorUserId: actor.id, action: "customer.view_as.start" } });
    expect(start?.entityId).toBe(c.clientProfileId);
    expect(start?.summary).toContain("Sara Test");

    await endImpersonation(result.markerId);
    expect(await getClientSessionUser(result.sessionToken)).toBeNull();
    expect(await getImpersonation(result.markerId)).toBeNull();
    expect(await prisma.auditLog.count({ where: { actorUserId: actor.id, action: "customer.view_as.end" } })).toBe(1);
  });

  it("ignores malformed marker ids", async () => {
    expect(await getImpersonation("../../etc")).toBeNull();
    expect(await getImpersonation(undefined)).toBeNull();
  });
});
