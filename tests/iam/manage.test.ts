import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listRolesWithPermissions, createRole, setRolePermissions, deleteRole } from "@/modules/iam/roles";
import { listTiers, createTier, updateTier, deleteTier } from "@/modules/iam/tiers";

describe("roles management", () => {
  it("creates a custom role, sets its permissions, and reflects it in listRolesWithPermissions", async () => {
    const key = `test-role-${Date.now()}`;
    const role = await createRole({ key, name: "Test Role" });

    try {
      expect(role.id).toBeTruthy();
      expect(role.key).toBe(key);
      expect(role.isSystem).toBe(false);

      await setRolePermissions(role.id, [PERMISSIONS.BOOKING_VIEW, PERMISSIONS.CLIENT_VIEW]);

      const roles = await listRolesWithPermissions();
      const found = roles.find((r) => r.id === role.id);
      expect(found).toBeTruthy();
      expect(found?.permissionKeys.sort()).toEqual([PERMISSIONS.BOOKING_VIEW, PERMISSIONS.CLIENT_VIEW].sort());

      // replace with a different subset — old ones should be gone
      await setRolePermissions(role.id, [PERMISSIONS.MARKETING_MANAGE]);
      const rolesAfter = await listRolesWithPermissions();
      const foundAfter = rolesAfter.find((r) => r.id === role.id);
      expect(foundAfter?.permissionKeys).toEqual([PERMISSIONS.MARKETING_MANAGE]);
    } finally {
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.role.deleteMany({ where: { id: role.id } });
    }
  });

  it("throws when setRolePermissions is given an invalid permission key", async () => {
    const key = `test-role-invalid-${Date.now()}`;
    const role = await createRole({ key, name: "Invalid Perm Role" });

    try {
      await expect(
        setRolePermissions(role.id, ["not:a:real:permission"] as unknown as (typeof PERMISSIONS)[keyof typeof PERMISSIONS][]),
      ).rejects.toThrow();
    } finally {
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.role.deleteMany({ where: { id: role.id } });
    }
  });

  it("throws when creating a role with a non-slug key or a duplicate key", async () => {
    await expect(createRole({ key: "Not A Slug!", name: "Bad" })).rejects.toThrow();

    const key = `test-role-dup-${Date.now()}`;
    const role = await createRole({ key, name: "Dup" });
    try {
      await expect(createRole({ key, name: "Dup Again" })).rejects.toThrow();
    } finally {
      await prisma.role.deleteMany({ where: { id: role.id } });
    }
  });

  it("throws when deleting a system role, and succeeds for a custom role", async () => {
    const owner = await prisma.role.findFirstOrThrow({ where: { key: "owner" } });
    await expect(deleteRole(owner.id)).rejects.toThrow();

    const key = `test-role-delete-${Date.now()}`;
    const role = await createRole({ key, name: "To Delete" });
    await deleteRole(role.id);
    expect(await prisma.role.findUnique({ where: { id: role.id } })).toBeNull();
  });
});

describe("tiers management", () => {
  it("creates, updates, and deletes a custom tier", async () => {
    const key = `test-tier-${Date.now()}`;
    const tier = await createTier({ key, name: "Test Tier", priority: 5, discountPct: 15 });

    try {
      expect(tier.id).toBeTruthy();
      expect(tier.isSystem).toBe(false);

      const all = await listTiers();
      expect(all.some((t) => t.id === tier.id)).toBe(true);

      const updated = await updateTier(tier.id, { discountPct: 25 });
      expect(updated.discountPct).toBe(25);

      await deleteTier(tier.id);
      expect(await prisma.membershipTier.findUnique({ where: { id: tier.id } })).toBeNull();
    } finally {
      await prisma.membershipTier.deleteMany({ where: { key } });
    }
  });

  it("throws when creating a tier with an out-of-range discountPct", async () => {
    const key = `test-tier-badpct-${Date.now()}`;
    await expect(createTier({ key, name: "Bad Pct", discountPct: 150 })).rejects.toThrow();
    expect(await prisma.membershipTier.findUnique({ where: { key } })).toBeNull();
  });

  it("throws when deleting a system tier", async () => {
    const guest = await prisma.membershipTier.findFirstOrThrow({ where: { key: "guest" } });
    await expect(deleteTier(guest.id)).rejects.toThrow();
  });
});
