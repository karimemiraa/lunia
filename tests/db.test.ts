import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";

describe("db", () => {
  it("writes and reads a SiteSetting", async () => {
    const key = `test_${Date.now()}`;
    await prisma.siteSetting.create({ data: { key, value: { ok: true } } });
    const found = await prisma.siteSetting.findUnique({ where: { key } });
    expect((found?.value as { ok: boolean }).ok).toBe(true);
    await prisma.siteSetting.delete({ where: { key } });
  });
  afterAll(async () => { await prisma.$disconnect(); });
});
