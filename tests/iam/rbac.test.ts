import { describe, it, expect } from "vitest";
import { getCurrentUser, getUserPermissions } from "@/modules/iam/rbac";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { createSession, destroySession } from "@/modules/iam/session";

describe("rbac", () => {
  it("owner has settings:manage", async () => {
    const owner = await prisma.user.findFirstOrThrow({ where: { email: "owner@lunia.local" } });
    const perms = await getUserPermissions(owner.id);
    expect(perms.has(PERMISSIONS.SETTINGS_MANAGE)).toBe(true);
  });

  it("getCurrentUser returns null for a deactivated user, and non-null once reactivated", async () => {
    const user = await prisma.user.create({
      data: {
        type: "STAFF",
        email: `deactivated-${Date.now()}@lunia.local`,
        isActive: false,
      },
    });
    const token = await createSession(user.id);

    try {
      const result = await getCurrentUser(token);
      expect(result).toBeNull();

      await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
      const reactivated = await getCurrentUser(token);
      expect(reactivated).not.toBeNull();
      expect(reactivated?.id).toBe(user.id);
    } finally {
      await destroySession(token);
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it("getCurrentUser returns null for a CLIENT user's session token, but resolves a STAFF (owner) session token", async () => {
    // A client and a staff session share the exact same underlying Session
    // mechanism (createSession/getSession), just stored under different
    // cookie names (lunia_client_session vs lunia_session) -- so a client's
    // token, if passed to getCurrentUser (the admin-side resolver), must
    // NOT resolve to a user, or a client could satisfy requireAdmin().
    const client = await prisma.user.create({
      data: { type: "CLIENT", phone: `+9665${Date.now()}9999`, isActive: true },
    });
    const clientToken = await createSession(client.id);

    const owner = await prisma.user.findFirstOrThrow({ where: { email: "owner@lunia.local" } });
    const staffToken = await createSession(owner.id);

    try {
      const asClient = await getCurrentUser(clientToken);
      expect(asClient).toBeNull();

      const asStaff = await getCurrentUser(staffToken);
      expect(asStaff).not.toBeNull();
      expect(asStaff?.id).toBe(owner.id);
    } finally {
      await destroySession(clientToken);
      await destroySession(staffToken);
      await prisma.user.delete({ where: { id: client.id } });
    }
  });
});
