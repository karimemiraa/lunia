import { describe, it, expect } from "vitest";
import { getUserPermissions } from "@/modules/iam/rbac";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/modules/iam/permissions";

describe("rbac", () => {
  it("owner has settings:manage", async () => {
    const owner = await prisma.user.findFirstOrThrow({ where: { email: "owner@lunia.local" } });
    const perms = await getUserPermissions(owner.id);
    expect(perms.has(PERMISSIONS.SETTINGS_MANAGE)).toBe(true);
  });
});
