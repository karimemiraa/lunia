import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { recordAudit, listAuditLogs } from "@/modules/iam/audit";

const ACTOR = `audit-test-actor-${Date.now()}`;

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { actorUserId: ACTOR } });
});

describe("recordAudit", () => {
  it("writes an audit row", async () => {
    await recordAudit({ actorUserId: ACTOR, action: "ROLE_UPDATE", entityType: "Role", entityId: "r1", summary: "changed perms" });
    const rows = await prisma.auditLog.findMany({ where: { actorUserId: ACTOR } });
    expect(rows.length).toBe(1);
    expect(rows[0]!.action).toBe("ROLE_UPDATE");
    expect(rows[0]!.entityId).toBe("r1");
  });

  it("does not throw on an incomplete payload (auditing never breaks the mutation)", async () => {
    // @ts-expect-error deliberately missing required fields
    await expect(recordAudit({ actorUserId: ACTOR })).resolves.toBeUndefined();
    const rows = await prisma.auditLog.findMany({ where: { actorUserId: ACTOR } });
    expect(rows.length).toBe(0);
  });
});

describe("listAuditLogs", () => {
  it("returns most-recent-first and filters by search", async () => {
    await recordAudit({ actorUserId: ACTOR, action: "TIER_CREATE", entityType: "MembershipTier", summary: "created gold tier" });
    await recordAudit({ actorUserId: ACTOR, action: "SETTINGS_UPDATE", entityType: "SiteSetting", summary: "updated hours" });
    const all = await listAuditLogs({ limit: 500 });
    const mine = all.filter((r) => r.actorUserId === ACTOR);
    expect(mine.length).toBe(2);

    const hits = (await listAuditLogs({ limit: 500, search: "gold tier" })).filter((r) => r.actorUserId === ACTOR);
    expect(hits.length).toBe(1);
    expect(hits[0]!.action).toBe("TIER_CREATE");
  });
});
