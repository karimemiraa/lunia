import { describe, it, expect, afterAll } from "vitest";
import { createSession, getSession, destroySession } from "@/modules/iam/session";
import { getRedis } from "@/lib/redis";

describe("session", () => {
  it("creates, reads, and destroys a session", async () => {
    const token = await createSession("user_1");
    expect(await getSession(token)).toEqual({ userId: "user_1" });
    await destroySession(token);
    expect(await getSession(token)).toBeNull();
  });
  afterAll(async () => { getRedis().disconnect(); });
});
