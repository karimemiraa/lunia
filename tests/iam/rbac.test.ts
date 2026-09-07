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
});
