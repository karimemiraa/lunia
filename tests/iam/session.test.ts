import { describe, it, expect } from "vitest";
import { getRedis } from "@/lib/redis";
import { createSession, getSession, destroySession } from "@/modules/iam/session";

describe("getSession hardening", () => {
  it("round-trips a valid session", async () => {
    const token = await createSession("user-1");
    expect(await getSession(token)).toEqual({ userId: "user-1" });
    await destroySession(token);
  });

  it("returns null and deletes the key for a non-JSON value", async () => {
    const token = "corrupt-token-nonjson";
    await getRedis().set(`session:${token}`, "not-json{", "EX", 60);
    expect(await getSession(token)).toBeNull();
    expect(await getRedis().get(`session:${token}`)).toBeNull();
  });

  it("returns null for a JSON value missing userId", async () => {
    const token = "corrupt-token-shape";
    await getRedis().set(`session:${token}`, JSON.stringify({ nope: 1 }), "EX", 60);
    expect(await getSession(token)).toBeNull();
    // getSession must have deleted the malformed value, same as the non-JSON case.
    expect(await getRedis().get(`session:${token}`)).toBeNull();
    await destroySession(token);
  });

  it("returns null for an absent token", async () => {
    expect(await getSession("does-not-exist")).toBeNull();
  });
});
