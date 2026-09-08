import { describe, it, expect, beforeEach } from "vitest";
import { getRedis } from "@/lib/redis";
import {
  checkLoginAllowed, recordLoginFailure, recordLoginSuccess, MAX_ATTEMPTS,
} from "@/modules/iam/loginThrottle";

const KEY = `test:${Date.now()}:user@example.com`;

beforeEach(async () => {
  await getRedis().del(`loginfail:${KEY}`, `loginlock:${KEY}`);
});

describe("login throttle", () => {
  it("allows initially and after a success clears failures", async () => {
    expect((await checkLoginAllowed(KEY)).allowed).toBe(true);
    await recordLoginFailure(KEY);
    await recordLoginSuccess(KEY);
    expect((await checkLoginAllowed(KEY)).allowed).toBe(true);
  });

  it("locks out after MAX_ATTEMPTS failures", async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await recordLoginFailure(KEY);
    const res = await checkLoginAllowed(KEY);
    expect(res.allowed).toBe(false);
    expect(res.retryAfterSeconds).toBeGreaterThan(0);
  });
});
